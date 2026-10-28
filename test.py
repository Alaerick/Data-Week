import sqlite3

data = sqlite3.connect("basketball.db")
cursor = data.cursor()

cursor.execute("""
    SELECT
        athlete_id,
        athlete_display_name,
        SUM(three_point_field_goals_made) AS total_three_pointers
    FROM game_box
    GROUP BY athlete_id, athlete_display_name
    ORDER BY total_three_pointers DESC
    LIMIT 10;
""")

results = cursor.fetchall()

print("Athlete ID | Athlete Name | Three Pointers Made")

for row in results:
    print(f"{row[0]} | {row[1]} | {row[2]}")

