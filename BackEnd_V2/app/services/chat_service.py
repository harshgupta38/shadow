import asyncio
import logging
import uuid
from datetime import datetime, timezone
from json import JSONDecodeError

logger = logging.getLogger(__name__)

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from functools import partial

from app.llm.models import MessageResponse
from app.llm.config import llm_settings
from app.llm.tools import ToolContext, execute_tool
from app.core.exceptions import NotFoundError, ValidationError
from app.llm import get_llm_service, NewConvoResponse, LLMError, LLMRequestError
from app.models.user import UserDBM
from app.models.chat import ConversationDBM, MessageDBM
from app.models.goal import GoalDBM
from app.models.goal_proposal import GoalProposalDBM
from app.models.milestone import MilestoneDBM
from app.models.milestone_proposal import MilestoneProposalDBM
from app.models.task_proposal import TaskProposalDBM
from app.schemas.chat import (
    ConvoDataResponse,
    ConvoDataShortResponse,
    MessageChunkResponse,
    MessageDataResponse,
    MessageRequest,
    MessageRoleEnum,
    NewConvoRequest,
    RenameConvoRequest,
)


def _serialize_conversation(conversation: ConversationDBM) -> ConvoDataShortResponse:
    return ConvoDataShortResponse.model_validate(conversation)


def _resolve_goal_proposal_actions(
    db: Session, current_user: UserDBM, linked_items: dict
) -> dict:
    """Derive each proposal's CTA from whether its referenced goal still exists.

    A proposal's stored status/goal_id are historical; the goal may have been
    deleted since, so the action is resolved live against GoalDBM every time.
    """
    proposals = linked_items.get("goal_proposals")
    if not proposals:
        return linked_items

    goal_ids = {p["goal_id"] for p in proposals if p.get("goal_id") is not None}
    existing_goal_ids: set[int] = set()
    if goal_ids:
        existing_goal_ids = set(
            db.scalars(
                select(GoalDBM.id).where(
                    GoalDBM.id.in_(goal_ids),
                    GoalDBM.user_id == current_user.id,
                )
            ).all()
        )

    resolved_proposals = [
        {
            **proposal,
            "goal_action": "view" if proposal.get("goal_id") in existing_goal_ids else "create",
        }
        for proposal in proposals
    ]

    return {**linked_items, "goal_proposals": resolved_proposals}


def _resolve_milestone_proposal_actions(
    db: Session, current_user: UserDBM, linked_items: dict
) -> dict:
    """Derive each milestone proposal's CTA from whether its milestone still exists."""
    proposals = linked_items.get("milestone_proposals")
    if not proposals:
        return linked_items

    milestone_ids = {p["milestone_id"] for p in proposals if p.get("milestone_id") is not None}
    existing_milestone_ids: set[int] = set()
    if milestone_ids:
        existing_milestone_ids = set(
            db.scalars(
                select(MilestoneDBM.id).where(
                    MilestoneDBM.id.in_(milestone_ids),
                    MilestoneDBM.user_id == current_user.id,
                )
            ).all()
        )

    resolved_proposals = [
        {
            **proposal,
            "milestone_action": "view" if proposal.get("milestone_id") in existing_milestone_ids else "create",
        }
        for proposal in proposals
    ]

    return {**linked_items, "milestone_proposals": resolved_proposals}


def _resolve_task_proposal_actions(
    db: Session, current_user: UserDBM, linked_items: dict
) -> dict:
    """Derive each task proposal's CTA from whether its task still exists."""
    proposals = linked_items.get("task_proposals")
    if not proposals:
        return linked_items

    from app.models.task import TaskDBM

    task_ids = {p["task_id"] for p in proposals if p.get("task_id") is not None}
    existing_task_ids: set[int] = set()
    if task_ids:
        existing_task_ids = set(
            db.scalars(
                select(TaskDBM.id).where(
                    TaskDBM.id.in_(task_ids),
                    TaskDBM.user_id == current_user.id,
                )
            ).all()
        )

    resolved_proposals = [
        {
            **proposal,
            "task_action": "view" if proposal.get("task_id") in existing_task_ids else "create",
        }
        for proposal in proposals
    ]

    return {**linked_items, "task_proposals": resolved_proposals}


def _serialize_message(
    db: Session, current_user: UserDBM, message: MessageDBM
) -> MessageDataResponse:
    data = MessageDataResponse.model_validate(message)
    data.linked_items = _resolve_goal_proposal_actions(db, current_user, data.linked_items)
    data.linked_items = _resolve_milestone_proposal_actions(db, current_user, data.linked_items)
    data.linked_items = _resolve_task_proposal_actions(db, current_user, data.linked_items)
    return data


def _attach_milestone_proposals(
    db: Session,
    current_user: UserDBM,
    conversation: ConversationDBM,
    assistant_message: MessageDBM,
    action_data: dict | None,
    content_index: int,
) -> None:
    """Persist milestone proposals to DB and attach them to the message linked_items.

    Each milestone gets its own proposal row and UUID so the frontend can
    track and save them independently. Existing proposals from prior
    regenerations are preserved untouched.
    """
    if not action_data or "milestone_proposals" not in action_data:
        return

    proposal_data = action_data["milestone_proposals"]
    goal_id = proposal_data["goal_id"]
    milestones = proposal_data["milestones"]

    existing_linked_items = assistant_message.linked_items or {}
    existing_proposals = list(existing_linked_items.get("milestone_proposals") or [])

    for milestone in milestones:
        proposal_id = str(uuid.uuid4())
        db.add(
            MilestoneProposalDBM(
                proposal_id=proposal_id,
                user_id=current_user.id,
                conversation_id=conversation.id,
                message_id=assistant_message.id,
                content_index=content_index,
                goal_id=goal_id,
                status="pending",
                milestone_id=None,
            )
        )
        existing_proposals.append(
            {
                "proposal_id": proposal_id,
                "content_index": content_index,
                "goal_id": goal_id,
                "status": "pending",
                "milestone_id": None,
                "milestone": milestone,
            }
        )

    assistant_message.linked_items = {
        **existing_linked_items,
        "milestone_proposals": existing_proposals,
    }


def _attach_task_proposals(
    db: Session,
    current_user: UserDBM,
    conversation: ConversationDBM,
    assistant_message: MessageDBM,
    action_data: dict | None,
    content_index: int,
) -> None:
    """Persist task proposals to DB and attach them to the message linked_items.

    Each task gets its own proposal row and UUID so the frontend can
    track and save them independently. Existing proposals from prior
    regenerations are preserved untouched.
    """
    if not action_data or "task_proposals" not in action_data:
        return

    proposal_data = action_data["task_proposals"]
    goal_id = proposal_data["goal_id"]
    milestone_id = proposal_data["milestone_id"]
    tasks = proposal_data["tasks"]

    existing_linked_items = assistant_message.linked_items or {}
    existing_proposals = list(existing_linked_items.get("task_proposals") or [])

    for task in tasks:
        proposal_id = str(uuid.uuid4())
        db.add(
            TaskProposalDBM(
                proposal_id=proposal_id,
                user_id=current_user.id,
                conversation_id=conversation.id,
                message_id=assistant_message.id,
                content_index=content_index,
                goal_id=goal_id,
                milestone_id=milestone_id,
                status="pending",
                task_id=None,
            )
        )
        existing_proposals.append(
            {
                "proposal_id": proposal_id,
                "content_index": content_index,
                "goal_id": goal_id,
                "milestone_id": milestone_id,
                "status": "pending",
                "task_id": None,
                "task": task,
            }
        )

    assistant_message.linked_items = {
        **existing_linked_items,
        "task_proposals": existing_proposals,
    }


def _attach_goal_proposal(
    db: Session,
    current_user: UserDBM,
    conversation: ConversationDBM,
    assistant_message: MessageDBM,
    action_data: dict | None,
    content_index: int,
) -> None:
    """Persist a new goal proposal for a specific generated content version.

    Existing proposals for other content versions (e.g. from prior
    generations) are preserved untouched.
    """
    if not action_data or "refined_goal" not in action_data:
        return

    proposal_id = str(uuid.uuid4())

    db.add(
        GoalProposalDBM(
            proposal_id=proposal_id,
            user_id=current_user.id,
            conversation_id=conversation.id,
            message_id=assistant_message.id,
            content_index=content_index,
            status="pending",
            goal_id=None,
        )
    )

    existing_linked_items = assistant_message.linked_items or {}
    existing_proposals = list(existing_linked_items.get("goal_proposals") or [])
    existing_proposals.append(
        {
            "proposal_id": proposal_id,
            "content_index": content_index,
            "status": "pending",
            "goal_id": None,
            "goal": action_data["refined_goal"],
        }
    )
    assistant_message.linked_items = {
        **existing_linked_items,
        "goal_proposals": existing_proposals,
    }


def conversation_list(
    db: Session, current_user: UserDBM
) -> list[ConvoDataShortResponse]:
    conversations = list(
        db.scalars(
            select(ConversationDBM)
            .where(ConversationDBM.user_id == current_user.id)
            .order_by(ConversationDBM.updated_at.desc(), ConversationDBM.id.desc())
        ).all()
    )
    return [_serialize_conversation(conversation) for conversation in conversations]


async def create_conversation(
    db: Session,
    current_user: UserDBM,
    data: NewConvoRequest,
) -> NewConvoResponse:
    llm_service = get_llm_service()

    tool_context = ToolContext(db=db, current_user=current_user)
    tool_executor = partial(execute_tool, context=tool_context)

    try:
        response = await llm_service.create_conversation(
            data, 
            user_id=current_user.id,
            goal_id=data.goal_id,
            milestone_id=data.milestone_id,
            
            tool_executor=tool_executor,
        )
    except LLMError as exc:
        raise LLMRequestError(f"Failed to create conversation: {exc}") from exc
    except JSONDecodeError as exc:
        raise LLMRequestError(f"Failed to decode LLM response: {exc}") from exc

    conversation = ConversationDBM(
        user_id=current_user.id,
        title=response.llm_data.title,
        agent_type=data.agent_type,
        summary_user_message_count=1,
        stable_context=response.llm_data.stable_context,
        context_summary=response.llm_data.context_summary,
        linked_items={},
    )
    db.add(conversation)
    db.flush()

    user_message = MessageDBM(
        conversation_id=conversation.id,
        role=MessageRoleEnum.USER,
        content=[data.content],
        request_status="completed",
    )
    db.add(user_message)

    assistant_message = MessageDBM(
        conversation_id=conversation.id,
        role=MessageRoleEnum.ASSISTANT,
        content=[response.llm_data.content],
        linked_items={},
        request_status="completed",
    )
    db.add(assistant_message)
    db.flush()

    _attach_goal_proposal(
        db, current_user, conversation, assistant_message, tool_context.action_data, 0
    )
    _attach_milestone_proposals(db, current_user, conversation, assistant_message, tool_context.action_data, 0)
    _attach_task_proposals(db, current_user, conversation, assistant_message, tool_context.action_data, 0)

    db.commit()
    db.refresh(conversation)
    db.refresh(assistant_message)

    resolved_linked_items = _resolve_goal_proposal_actions(
        db, current_user, assistant_message.linked_items
    )
    resolved_linked_items = _resolve_milestone_proposal_actions(
        db, current_user, resolved_linked_items
    )
    resolved_linked_items = _resolve_task_proposal_actions(
        db, current_user, resolved_linked_items
    )

    message_data = MessageDataResponse(
        id=assistant_message.id,
        conversation_id=conversation.id,
        content=assistant_message.content,
        role=MessageRoleEnum.ASSISTANT,
        request_status="completed",
        linked_items=resolved_linked_items,
        created_at=assistant_message.created_at,
    )

    conversation_data = ConvoDataResponse(
        id=conversation.id,
        user_id=conversation.user_id,
        title=conversation.title,
        agent_type=conversation.agent_type,

        stable_context=conversation.stable_context,
        context_summary=conversation.context_summary,
        summary_user_message_count=conversation.summary_user_message_count,
        linked_items=conversation.linked_items,

        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )

    return NewConvoResponse(
        message_data=message_data,
        conversation_data=conversation_data,

        provider=response.provider,
        model=response.model,
        model_str=response.model_str,
        finish_reason=response.finish_reason,
        usage=response.usage,
        response_id=response.response_id,
        response_time_ms=response.response_time_ms,
        cost=response.cost,
    )


def get_message_chunk(
    db: Session,
    current_user: UserDBM,
    conversation_id: int,
    limit: int,
    before_message_id: int | None,
) -> MessageChunkResponse:
    conversation = db.get(ConversationDBM, conversation_id)

    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found or access denied.")

    query = select(MessageDBM).where(MessageDBM.conversation_id == conversation_id)
    if before_message_id is not None:
        query = query.where(MessageDBM.id < before_message_id)

    messages = list(
        db.scalars(query.order_by(MessageDBM.id.desc()).limit(limit + 1)).all()
    )
    has_more = len(messages) > limit
    message_list = messages[:limit]
    message_list.reverse()

    return MessageChunkResponse(
        message_list=[_serialize_message(db, current_user, message) for message in message_list],
        has_more=has_more,
    )


def delete_conversation(
    db: Session, current_user: UserDBM, conversation_id: int
) -> None:
    conversation = db.get(ConversationDBM, conversation_id)

    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found or access denied.")

    db.query(GoalDBM).filter(GoalDBM.source_conversation_id == conversation_id).update(
        {GoalDBM.source_conversation_id: None},
        synchronize_session=False,
    )

    db.execute(
        delete(GoalProposalDBM).where(
            GoalProposalDBM.conversation_id == conversation_id
        )
    )
    db.execute(delete(MessageDBM).where(MessageDBM.conversation_id == conversation_id))
    db.delete(conversation)
    db.commit()


def rename_conversation(
    db: Session,
    current_user: UserDBM,
    conversation_id: int,
    data: RenameConvoRequest,
) -> ConvoDataShortResponse:
    conversation = db.get(ConversationDBM, conversation_id)

    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found or access denied.")

    conversation.title = data.title
    db.commit()
    db.refresh(conversation)

    return _serialize_conversation(conversation)


async def _call_llm_and_save(
    db: Session,
    current_user: UserDBM,
    conversation: ConversationDBM,
    user_message: MessageDBM,
    data: MessageRequest,
    recent_message_data: list[dict],
) -> MessageResponse:
    user_message.request_status = "pending"
    db.commit()

    tool_context = ToolContext(db=db, current_user=current_user)
    tool_executor = partial(execute_tool, context=tool_context)

    llm_service = get_llm_service()
    try:
        response = await llm_service.respond_to_message(
            data,
            user_id=current_user.id,
            goal_id=data.goal_id,
            milestone_id=data.milestone_id,

            agent_type=conversation.agent_type,
            stable_context=conversation.stable_context,
            context_summary=conversation.context_summary,
            recent_messages=recent_message_data,
            tool_executor=tool_executor,
        )
    except LLMError as exc:
        user_message.request_status = "failed"
        db.commit()
        raise LLMRequestError(f"Failed to get response: {exc}") from exc
    except JSONDecodeError as exc:
        user_message.request_status = "failed"
        db.commit()
        raise LLMRequestError(f"Failed to decode LLM response: {exc}") from exc

    user_message.request_status = "completed"

    assistant_message = MessageDBM(
        conversation_id=conversation.id,
        role=MessageRoleEnum.ASSISTANT,
        content=[response.llm_data.content],
        linked_items={},
        request_status="completed",
    )
    db.add(assistant_message)
    db.flush()

    _attach_goal_proposal(
        db, current_user, conversation, assistant_message, tool_context.action_data, 0
    )
    _attach_milestone_proposals(
        db, current_user, conversation, assistant_message, tool_context.action_data, 0
    )
    _attach_task_proposals(
        db, current_user, conversation, assistant_message, tool_context.action_data, 0
    )

    conversation.updated_at = assistant_message.created_at
    db.commit()
    db.refresh(assistant_message)

    return MessageResponse(
        message_data=_serialize_message(db, current_user, assistant_message),
        provider=response.provider,
        model=response.model,
        model_str=response.model_str,
        finish_reason=response.finish_reason,
        usage=response.usage,
        response_id=response.response_id,
        response_time_ms=response.response_time_ms,
        cost=response.cost,
    )


async def respond_to_message(
    db: Session,
    current_user: UserDBM,
    conversation_id: int,
    data: MessageRequest,
) -> MessageResponse:
    conversation = db.get(ConversationDBM, conversation_id)

    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found or access denied.")

    recent_messages = list(
        db.scalars(
            select(MessageDBM)
            .where(MessageDBM.conversation_id == conversation.id)
            .order_by(MessageDBM.id.desc())
            .limit(llm_settings.chat_recent_message_limit)
        ).all()
    )
    recent_messages.reverse()

    stored_user_message_count = db.scalar(
        select(func.count())
        .select_from(MessageDBM)
        .where(
            MessageDBM.conversation_id == conversation.id,
            MessageDBM.role == MessageRoleEnum.USER,
        )
    ) or 0
    total_user_message_count = stored_user_message_count + 1
    new_user_message_count = (
        total_user_message_count - conversation.summary_user_message_count
    )
    summary_update_due = (
        new_user_message_count >= llm_settings.chat_summary_update_user_messages
    )

    recent_message_data = [
        {"role": message.role, "content": message.content[-1]}
        for message in recent_messages
    ]
    context_messages = [
        *recent_message_data,
        {"role": MessageRoleEnum.USER, "content": data.content},
    ]

    llm_service = get_llm_service()
    context_task = None
    if summary_update_due:
        # Fire the context summary update concurrently with the main LLM call
        # instead of awaiting it first. Both run in parallel, so the extra
        # latency is max(context_time, message_time) rather than their sum.
        # The update is non-critical — if it fails, the next threshold retries.
        context_task = asyncio.create_task(
            llm_service.update_conversation_context(
                user_id=current_user.id,
                agent_type=conversation.agent_type,
                stable_context=conversation.stable_context,
                context_summary=conversation.context_summary,
                messages=context_messages,
            )
        )

    user_message = MessageDBM(
        conversation_id=conversation.id,
        role=MessageRoleEnum.USER,
        content=[data.content],
        request_status="pending",
    )
    db.add(user_message)

    try:
        message_response = await _call_llm_and_save(db, current_user, conversation, user_message, data, recent_message_data)
    except Exception:
        # If message generation fails, cancel and drain the context task so it
        # doesn't run orphaned in the background. An unattended task exception
        # produces "Task exception was never retrieved" warnings and wastes an
        # LLM request that no one will read.
        if context_task is not None:
            context_task.cancel()
            try:
                await context_task
            except (asyncio.CancelledError, Exception):
                pass
        raise

    if context_task is not None:
        try:
            # context_task ran concurrently with _call_llm_and_save.
            # Total wait = max(context_time, message_time), not their sum.
            context_response = await context_task
            context_data = context_response.llm_data
            if context_data.context_summary.strip():
                conversation.context_summary = context_data.context_summary
                if context_data.stable_context and context_data.stable_context.strip():
                    conversation.stable_context = context_data.stable_context
                conversation.summary_user_message_count = total_user_message_count
                db.commit()
        except Exception:
            logger.exception("Context summary update failed; will retry at next threshold.")

    return message_response


async def retry_failed_message(
    db: Session,
    current_user: UserDBM,
    conversation_id: int,
    message_id: int,
) -> MessageResponse:
    conversation = db.get(ConversationDBM, conversation_id)
    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found or access denied.")

    user_message = db.get(MessageDBM, message_id)
    if not user_message or user_message.conversation_id != conversation_id:
        raise NotFoundError("Message not found.")

    if user_message.role != MessageRoleEnum.USER:
        raise ValidationError("Only user messages can be retried.")

    if user_message.request_status != "failed":
        raise ValidationError("Only failed messages can be retried.")

    preceding_messages = list(
        db.scalars(
            select(MessageDBM)
            .where(
                MessageDBM.conversation_id == conversation_id,
                MessageDBM.id < message_id,
            )
            .order_by(MessageDBM.id.desc())
            .limit(llm_settings.chat_recent_message_limit)
        ).all()
    )
    preceding_messages.reverse()

    recent_message_data = [
        {"role": msg.role, "content": msg.content[-1]}
        for msg in preceding_messages
    ]

    data = MessageRequest(content=user_message.content[-1])
    return await _call_llm_and_save(db, current_user, conversation, user_message, data, recent_message_data)


async def regenerate_response(
    db: Session,
    current_user: UserDBM,
    conversation_id: int,
    message_id: int,
) -> MessageResponse:
    conversation = db.get(ConversationDBM, conversation_id)
    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found or access denied.")

    assistant_message = db.get(MessageDBM, message_id)
    if not assistant_message or assistant_message.conversation_id != conversation_id:
        raise NotFoundError("Message not found or does not belong to this conversation.")

    if assistant_message.role != MessageRoleEnum.ASSISTANT:
        raise ValidationError("Only assistant messages can be regenerated.")

    latest_message_id = db.scalar(
        select(func.max(MessageDBM.id)).where(
            MessageDBM.conversation_id == conversation_id
        )
    )
    if assistant_message.id != latest_message_id:
        raise ValidationError("Only the latest assistant message can be regenerated.")

    if not assistant_message.content:
        raise ValidationError("Message has no generated content to regenerate.")

    preceding_messages = list(
        db.scalars(
            select(MessageDBM)
            .where(
                MessageDBM.conversation_id == conversation_id,
                MessageDBM.id < message_id,
            )
            .order_by(MessageDBM.id.desc())
            .limit(llm_settings.chat_recent_message_limit)
        ).all()
    )
    preceding_messages.reverse()

    if not preceding_messages or preceding_messages[-1].role != MessageRoleEnum.USER:
        raise ValidationError("Could not find the source user message for this assistant response.")

    paired_user_message = preceding_messages[-1]
    if not paired_user_message.content or not paired_user_message.content[-1].strip():
        raise ValidationError("The source user message has no content.")
    
    prior_messages = preceding_messages[:-1]

    recent_message_data = [
        {"role": msg.role, "content": msg.content[-1]}
        for msg in prior_messages
    ]
    data = MessageRequest(content=paired_user_message.content[-1])

    tool_context = ToolContext(db=db, current_user=current_user)
    tool_executor = partial(execute_tool, context=tool_context)

    llm_service = get_llm_service()
    try:
        response = await llm_service.respond_to_message(
            data,
            user_id=current_user.id,
            agent_type=conversation.agent_type,
            stable_context=conversation.stable_context,
            context_summary=conversation.context_summary,
            recent_messages=recent_message_data,
            tool_executor=tool_executor,
        )
    except LLMError as exc:
        raise LLMRequestError(f"Failed to regenerate response: {exc}") from exc
    except JSONDecodeError as exc:
        raise LLMRequestError(f"Failed to decode LLM response: {exc}") from exc

    db.refresh(assistant_message)
    assistant_message.content = [*assistant_message.content, response.llm_data.content]
    new_content_index = len(assistant_message.content) - 1

    _attach_goal_proposal(
        db,
        current_user,
        conversation,
        assistant_message,
        tool_context.action_data,
        new_content_index,
    )
    _attach_milestone_proposals(db, current_user, conversation, assistant_message, tool_context.action_data, new_content_index)
    _attach_task_proposals(db, current_user, conversation, assistant_message, tool_context.action_data, new_content_index)

    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(assistant_message)

    return MessageResponse(
        message_data=_serialize_message(db, current_user, assistant_message),
        provider=response.provider,
        model=response.model,
        model_str=response.model_str,
        finish_reason=response.finish_reason,
        usage=response.usage,
        response_id=response.response_id,
        response_time_ms=response.response_time_ms,
        cost=response.cost,
    )
