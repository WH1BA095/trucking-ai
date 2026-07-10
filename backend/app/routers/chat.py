from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import anthropic

from app.config import settings
from app.database import get_db
from app.models import ChatMessage, User
from app.schemas import ChatRequest, ChatResponse
from app.agent.tools import TOOL_DEFINITIONS, execute_tool
from app.agent.prompts import SYSTEM_PROMPT
from app.auth import get_current_user, rate_limit

router = APIRouter(prefix="/chat", tags=["chat"])
client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

HISTORY_LIMIT = 10  # last N messages per user kept in the prompt — keeps cost/latency predictable


@router.post("", response_model=ChatResponse)
def chat(req: ChatRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rate_limit(f"chat:{user.id}", max_calls=30, window=60)  # 30 messages/min per user
    # Load this user's recent history only — never another user's.
    history_rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(HISTORY_LIMIT)
        .all()
    )
    history_rows.reverse()
    messages = [{"role": m.role, "content": m.content} for m in history_rows]
    messages.append({"role": "user", "content": req.message})

    db.add(ChatMessage(user_id=user.id, role="user", content=req.message))

    reply_text = _run_agent_turn(db, messages, user.id)

    db.add(ChatMessage(user_id=user.id, role="assistant", content=reply_text))
    db.commit()

    return ChatResponse(reply=reply_text)


@router.get("/history")
def history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """This user's saved conversation, oldest first, to restore the chat on login."""
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    return [{"role": m.role, "text": m.content} for m in rows]


def _run_agent_turn(db: Session, messages: list[dict], user_id: str, max_tool_hops: int = 4) -> str:
    """Runs the tool-use loop: model may call tools multiple times before giving a final answer."""
    for _ in range(max_tool_hops):
        response = client.messages.create(
            model=settings.agent_model,
            max_tokens=800,
            system=SYSTEM_PROMPT,
            messages=messages,
            tools=TOOL_DEFINITIONS,
        )

        if response.stop_reason != "tool_use":
            return "".join(block.text for block in response.content if block.type == "text")

        # Model wants to call one or more tools — execute them and feed results back.
        messages.append({"role": "assistant", "content": response.content})
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_tool(db, block.name, block.input, user_id)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": str(result),
                })
        messages.append({"role": "user", "content": tool_results})

    return "Sorry, I couldn't complete that request — please try rephrasing."
