import re
import json

html = open('model_dump.html', encoding='utf-8').read()
scripts = re.findall(r'self\.__next_f\.push\(\[1,\"(.*?)\"\]\)', html, re.DOTALL)
for s in scripts:
    if 'WE49X22294' in s:
        # decode the unicode escapes
        s_decoded = s.encode('utf-8').decode('unicode_escape')
        open('encompass_rsc_raw.txt', 'w', encoding='utf-8').write(s_decoded)
        break
