from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, field_serializer


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # SQLite has no real timezone storage, so DateTime(timezone=True) columns
    # populated via func.now() (UTC) round-trip as naive datetimes. Without this,
    # they'd serialize with no UTC offset and every frontend `new Date(iso)` call
    # would misread them as local time instead of UTC.
    @field_serializer("*", check_fields=False)
    def _stamp_naive_datetimes_as_utc(self, value):
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value