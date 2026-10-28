import csv
import sqlite3

data = sqlite3.connect("basketball.db")
cursor = data.cursor()

cursor.execute("""
    SELECT season,
           COUNT(*) AS games,
           ROUND(AVG(field_goals_attempted - three_point_field_goals_attempted), 2) AS avg_2pa,
           ROUND(AVG(field_goals_made - three_point_field_goals_made), 2) AS avg_2pm,
           ROUND(AVG((field_goals_made - three_point_field_goals_made) * 100.0 /
                     NULLIF(field_goals_attempted - three_point_field_goals_attempted, 0)), 2) AS two_pt_pct,
           ROUND(AVG(three_point_field_goals_attempted), 2) AS avg_3pa,
           ROUND(AVG(three_point_field_goals_made), 2) AS avg_3pm,
           ROUND(AVG(three_point_field_goal_pct), 2) AS three_pt_pct,
           ROUND(AVG((field_goals_made - three_point_field_goals_made) * 100.0 / NULLIF(field_goals_attempted - three_point_field_goals_attempted, 0)), 2) / ROUND(AVG(three_point_field_goal_pct), 2) AS ratio
    FROM team_box
    GROUP BY season
    ORDER BY season;
""")

columns = [description[0] for description in cursor.description]
rows = cursor.fetchall()

for row in rows:
    print(dict(zip(columns, row)))

