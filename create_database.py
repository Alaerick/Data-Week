import sqlite3
import pandas as pd
import pathlib

folder = pathlib.Path(r"D:\NewFolder\Data Week\NCAA Women's Basketball Data Files 2026")

db = sqlite3.connect("basketball.db")

print(folder.exists())
print(list(folder.glob("*.csv")))

for file in folder.glob("*.csv"):
    table_name = file.stem
    df = pd.read_csv(file)
    df.to_sql(
        table_name,
        db,
        if_exists="replace",
        index=False
    )
    print(f"Table '{table_name}' created successfully from '{file.name}'.")

db.close()