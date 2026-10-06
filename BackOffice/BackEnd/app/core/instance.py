"""Identity of this running BackOffice process.

A new process means a restart actually happened, which a bare "the API answers again" can't prove
(the same process may just have been slow). /health returns these so the frontend can tell the
instance it was talking to before a restart apart from the one that answers afterwards.
"""
import uuid
from datetime import datetime, timezone

INSTANCE_ID = uuid.uuid4().hex
STARTED_AT = datetime.now(timezone.utc)
