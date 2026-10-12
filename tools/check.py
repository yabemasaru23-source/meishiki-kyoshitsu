"""章ファイルの自動点検： python tools/check.py （教材フォルダで実行）"""
import re, glob, os, json, sys, xml.dom.minidom as md
import yaml
sys.stdout.reconfigure(encoding='utf-8')
B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
man = json.load(open(B + 'content/chapters.json', encoding='utf-8'))
ids, probs = {}, []
for f in sorted(glob.glob(B + 'content/chapters/*.md')):
    n = os.path.basename(f); s = open(f, encoding='utf-8').read().replace('\r\n', '\n'); ch = n[:2]
    m = re.match(r'^---\n(.*?)\n---\n', s, re.S)
    if not m: probs.append(f'{n}: frontmatterなし'); continue
    fm = yaml.safe_load(m.group(1))
    info = next((c for c in man['chapters'] if c['id'] == ch), None)
    if not info: probs.append(f'{n}: chapters.json にない章'); continue
    if fm.get('title') != info['title']: probs.append(f'{n}: title不一致 {fm.get("title")}')
    if fm.get('cover') and not os.path.exists(B + 'assets/img/' + fm['cover']): probs.append(f'{n}: 扉絵がない {fm["cover"]}')
    for img in re.findall(r'\]\((assets/img/[^)]+)\)', s):
        if not os.path.exists(B + img): probs.append(f'{n}: 図がない {img}')
    heads = re.findall(r'^## (.+)$', s, re.M)
    if len(heads) < 10: probs.append(f'{n}: 見出し{len(heads)}個')
    nq = 0
    for y in re.findall(r'```work\n(.*?)\n```', s, re.S):
        try: w = yaml.safe_load(y)
        except Exception as e: probs.append(f'{n}: YAMLエラー {str(e)[:80]}'); continue
        i = str(w.get('id'))
        if not i.startswith(ch + '.'): probs.append(f'{n}: idの頭が章番号でない {i}')
        if i in ids: probs.append(f'{n}: id重複 {i}')
        ids[i] = n
        if re.match(r'^\d\d\.me$', i) and i != '00.me': probs.append(f'{n}: NN.me だけのid {i}')
        if w.get('type') == 'quiz':
            for q in w.get('questions', []):
                nq += 1
                if str(q.get('answer')) not in [str(o) for o in q.get('options', [])]: probs.append(f'{n}: 答えが選択肢にない {q.get("q", "")[:30]}')
                if not q.get('explain'): probs.append(f'{n}: 解説なし {q.get("q", "")[:30]}')
    print(f'{n}: 見出し{len(heads)} 入力欄{len(re.findall("```work", s))} クイズ{nq}問 {len(s)}字')
for c in man['chapters']:
    if c['file'] and not os.path.exists(B + 'content/chapters/' + c['file']): probs.append(f'chapters.json: ファイルがない {c["file"]}')
for f in glob.glob(B + 'assets/img/*.svg'):
    try: md.parse(f)
    except Exception as e: probs.append(f'{os.path.basename(f)}: SVGが壊れている {e}')
print('\n'.join(probs) or '問題なし')
