import sqlite3, time
db_path = r"D:\Freelancer-os\apps\scraper\.chrome_profiles\upwork\Default\Network\Cookies"
db = sqlite3.connect(db_path)
rows = db.execute(
    "SELECT host_key, name, expires_utc FROM cookies WHERE host_key LIKE '%upwork%'"
).fetchall()
print(f"Upwork cookies in Chrome profile: {len(rows)}")
chrome_epoch = 11644473600  # Chrome epoch offset
now = time.time()
for host, name, exp_chrome in rows:
    if exp_chrome > 0:
        exp_unix = exp_chrome / 1_000_000 - chrome_epoch
        status = 'EXPIRED' if exp_unix < now else f'valid ({int((exp_unix-now)/3600)}h)'
    else:
        status = 'session'
    print(f"  {name}: {host}  {status}")
db.close()
