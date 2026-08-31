"""
Kept for manual use. The same migration now runs automatically on server startup.
Run from BackEnd_V2/: python migrate_plans_constraint.py
"""
from app.db.session import engine
from app.db.migrations import run_all


if __name__ == "__main__":
    with engine.begin() as conn:
        run_all(conn)
    print("Done.")
