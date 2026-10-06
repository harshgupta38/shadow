from typing import Annotated

from fastapi import Depends

from app.core.security import verify_control_secret

RequireControlSecret = Annotated[None, Depends(verify_control_secret)]
