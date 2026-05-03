import pandas as pd
import json
import os

# Load CSV
df = pd.read_csv("city_safety_scores.csv")

# Clean column names
df.columns = df.columns.str.strip()

# ✅ Directly use existing Safety Zone
new_data = df[["City", "Safety Zone"]].to_dict(orient="records")

file_path = "crimeData.json"

# Load existing JSON
if os.path.exists(file_path):
    with open(file_path, "r") as f:
        try:
            existing_data = json.load(f)
        except:
            existing_data = []
else:
    existing_data = []

# Update / overwrite cities
city_map = {item["City"]: item for item in existing_data}

for entry in new_data:
    city_map[entry["City"]] = entry

updated_data = list(city_map.values())

# Save updated JSON
with open(file_path, "w") as f:
    json.dump(updated_data, f, indent=2)

print(json.dumps(updated_data, indent=2))