import httpx
from fastapi import HTTPException, Request
from .config import Settings
from .models import ExecutionContext


async def execution_context(request: Request, settings: Settings, locale: str = "ko") -> ExecutionContext:
    authorization = request.headers.get("authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication is required.")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication is required.")
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {token}"},
        )
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid access token.")
    subject = response.json().get("id")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=401, detail="Invalid access token.")
    return ExecutionContext(user_id=subject, access_token=token, permissions={"personal_memories:read"}, request_id=request.headers.get("x-request-id", "runtime"), locale="en" if locale == "en" else "ko")

