import json, time
from pathlib import Path
data = json.loads(Path('D:/Freelancer-os/apps/scraper/.sessions/upwork_session.json').read_text())
now = time.time()
interesting = ('cf_clearance','XSRF-TOKEN','visitor_topnav_gql_token','upwork-oauth-token','user_id','authorization')
for c in data.get('cookies',[]):
    name = c.get('name','')
    if any(k in name.lower() for k in interesting) or name in interesting:
        exp = c.get('expires', -1)
        if exp <= 0:
            expiry_str = 'session (no expiry)'
        elif exp < now:
            expiry_str = f'EXPIRED {int((now-exp)/3600)}h ago'
        else:
            expiry_str = f'valid ({int((exp-now)/3600)}h remaining)'
        print(f'{name}: domain={c.get("domain")}  {expiry_str}')
print(f'\nTotal cookies: {len(data.get("cookies",[]))}')
