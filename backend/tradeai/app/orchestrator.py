from services.preprocess import preprocess
from services.parse import parse
from services.rules import apply_rules
from services.rulings import generate_ruling

def run_step(step: str, session: dict, user_input: str | None = None):
    if step == "preprocess":
        session["data"].update(preprocess(user_input))
        session["step"] = "parse"
        return {"status": "processing"}

    if step == "parse":
        session["data"].update(parse(session["data"]))
        session["step"] = "rules"
        return {"status": "processing"}

    if step == "rules":
        result = apply_rules(session["data"])

        if result["next"] == "ask_user":
            session["step"] = "awaiting_user"
            return {
                "status": "need_user_input",
                "question": result["question"]
            }

        session["step"] = "rulings"
        return {"status": "processing"}

    if step == "rulings":
        output = generate_ruling(session["data"])
        session["step"] = "done"
        return {
            "status": "done",
            "result": output
        }
