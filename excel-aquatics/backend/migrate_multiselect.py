import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'aquatics.db')

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

# Add new columns for multi-select and adult capability
columns_to_add = [
    ("age_group_proficiencies", "TEXT DEFAULT '[]'"),
    ("swim_level_proficiencies", "TEXT DEFAULT '[]'"),
    ("adult_capable", "INTEGER DEFAULT 0"),
]

for col_name, col_def in columns_to_add:
    try:
        c.execute(f"ALTER TABLE instructors ADD COLUMN {col_name} {col_def}")
        print(f"Added column: {col_name}")
    except sqlite3.OperationalError as e:
        print(f"Column {col_name} already exists or error: {e}")

conn.commit()
conn.close()
print("Migration complete")
