"""Isolated live tests. Prints model output for review; keeps no temporary artifacts."""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[1]
PROMPTS = {
    'zh': '请比较周末在公园野餐与在家聚餐这两种安排，考虑天气和准备工作，给出简短建议。不要使用工具。',
    'ja': '週末に公園でピクニックをする場合と自宅で食事会を開く場合を比較し、天候と準備を考慮して短く提案してください。ツールは使わないでください。',
    'ar': 'قارن بين نزهة في الحديقة ووجبة جماعية في المنزل في عطلة نهاية الأسبوع، مع مراعاة الطقس والتحضير، وقدم توصية موجزة. لا تستخدم الأدوات.',
    'en': 'Compare a weekend picnic in the park with a meal at home, considering weather and preparation, and give a brief recommendation. Do not use tools.',
}


def credential():
    if os.environ.get('DEEPSEEK_API_KEY'):
        return os.environ['DEEPSEEK_API_KEY']
    db = Path.home() / '.local/share/opencode/opencode.db'
    with sqlite3.connect(f'file:{db}?mode=ro', uri=True) as connection:
        row, = connection.execute("SELECT value FROM credential WHERE integration_id='deepseek'").fetchall()
    return json.loads(row[0])['key']


def run_case(case, key):
    language, agent, repeat, prompt = case
    with tempfile.TemporaryDirectory(prefix='opencode-auto-language-test-') as directory:
        root = Path(directory)
        env = os.environ.copy()
        for name, folder in [('XDG_CONFIG_HOME', 'config'), ('XDG_DATA_HOME', 'data'), ('XDG_CACHE_HOME', 'cache'), ('XDG_STATE_HOME', 'state'), ('XDG_RUNTIME_DIR', 'runtime'), ('TMPDIR', 'tmp')]:
            path = root / folder
            path.mkdir(mode=0o700)
            env[name] = str(path)
        for name in ('OPENCODE_CONFIG', 'OPENCODE_CONFIG_CONTENT', 'OPENCODE_CONFIG_DIR'):
            env.pop(name, None)
        env.update(OPENCODE_DISABLE_PROJECT_CONFIG='1', OPENCODE_DISABLE_AUTOUPDATE='1', DEEPSEEK_API_KEY=key)
        config = root / 'config/opencode'
        config.mkdir()
        (config / 'opencode.json').write_text(json.dumps({'update': 'disable', 'snapshots': False, 'plugins': [str(REPO)]}))
        work = root / 'workspace'
        work.mkdir()
        prompts = prompt if isinstance(prompt, list) else [prompt]
        results = []
        session_id = None
        for turn, prompt in enumerate(prompts, 1):
            command = ['/usr/bin/opencode', 'run', '--standalone', '--agent', agent, '--model', 'deepseek/deepseek-flash#max', '--format', 'json', '--thinking', '--title', 'Language test']
            if session_id:
                command += ['--session', session_id]
            command.append(prompt)
            process = subprocess.Popen(command, cwd=work, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
            timed_out = False
            try:
                out, err = process.communicate(timeout=240)
            except subprocess.TimeoutExpired:
                timed_out = True
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    out, err = process.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    out, err = process.communicate()
            finally:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            events = [json.loads(line) for line in out.splitlines() if line.startswith('{')]
            result = {'case': f'{language}-{agent}-{repeat}-turn{turn}', 'exit': process.returncode, 'timeout': timed_out}
            for kind in ('reasoning', 'text'):
                result[kind] = '\n'.join(event.get('part', {}).get('text', '') for event in events if event.get('type') == kind)
            result['event_shapes'] = [{ 'type': e.get('type'), 'part_type': e.get('part', {}).get('type'), 'keys': list(e.get('part', {})) } for e in events]
            result['errors'] = [event for event in events if event.get('type') == 'error']
            result['stderr'] = err[-1500:]
            db = root / 'data/opencode/opencode.db'
            if db.exists():
                with sqlite3.connect(f'file:{db}?mode=ro', uri=True) as connection:
                    users = [json.loads(row[0]) for row in connection.execute("SELECT data FROM session_message WHERE type='user' ORDER BY seq")]
                result['prompt_unchanged'] = users[-1].get('text') in (prompt, '"' + prompt + '"')
                result['metadata'] = [u.get('metadata', {}).get('opencodeAutoLanguage') for u in users]
            session_id = next((event.get('sessionID') for event in events if event.get('sessionID')), session_id)
            results.append(result)
        serialized = '\n'.join(json.dumps(result, ensure_ascii=False) for result in results).replace(key, '[REDACTED]')
    assert not root.exists()
    return serialized


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--language', choices=list(PROMPTS))
    parser.add_argument('--extended', action='store_true')
    parser.add_argument('--smoke', action='store_true')
    parser.add_argument('--workers', type=int, default=3)
    args = parser.parse_args()
    cases = [(language, agent, repeat, prompt) for language, prompt in PROMPTS.items() for agent in ('plan', 'build') for repeat in range(1, 4)]
    if args.language:
        cases = [case for case in cases if case[0] == args.language]
    if args.smoke:
        cases = cases[:1]
    if args.extended:
        cases = [
            ('mixed-zh', 'plan', 1, '请用法语写一封两句话的野餐邀请邮件，然后用中文简要解释措辞。不要使用工具。'),
            ('mixed-ja', 'build', 1, 'スペイン語で二文のピクニック招待メールを書き、その表現を日本語で短く説明してください。ツールは使わないでください。'),
            ('switch', 'plan', 1, [PROMPTS['zh'], 'OK，继续补充一条建议。不要使用工具。', PROMPTS['ja'], 'はい']),
            ('explicit', 'build', 1, '请使用法语进行思考和交流，简短比较公园野餐和在家聚餐。不要使用工具。'),
        ]
    key = credential()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for result in pool.map(lambda case: run_case(case, key), cases):
            print(result, flush=True)


if __name__ == '__main__':
    main()
