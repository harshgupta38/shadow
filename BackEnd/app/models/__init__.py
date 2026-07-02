"""ORM models package.

Importing this package registers every model on ``Base.metadata`` (needed
for ``create_all`` and Alembic autogenerate) and lets relationship string
references resolve.
"""

from app.models.activity import ActivityLog
from app.models.base import Base, TimestampMixin, utcnow
from app.models.chat import ChatMessage, ChatSession
from app.models.goal import Goal
from app.models.journal import JournalEntry
from app.models.memory import MemoryEntry
from app.models.metric import TrackedMetric
from app.models.milestone import Milestone
from app.models.notification import Notification
from app.models.planned_task import PlannedTask
from app.models.report import Report
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.user_setting import UserSetting

__all__ = [
    "Base",
    "TimestampMixin",
    "utcnow",
    "User",
    "UserProfile",
    "UserSetting",
    "MemoryEntry",
    "Goal",
    "Milestone",
    "ChatSession",
    "ChatMessage",
    "JournalEntry",
    "Notification",
    "TrackedMetric",
    "ActivityLog",
    "PlannedTask",
    "Report",
]
