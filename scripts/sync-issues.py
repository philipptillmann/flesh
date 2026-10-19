#!/usr/bin/env python3
"""Create feature issues idempotently; complete implemented items after a push."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent


def gh(*args):
    return subprocess.check_output(['gh', *args], cwd=ROOT, text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, help='OWNER/flesh')
    parser.add_argument('--close-implemented', action='store_true')
    args = parser.parse_args()
    commit = None
    if args.close_implemented:
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        branch = subprocess.check_output(['git', 'branch', '--show-current'], cwd=ROOT, text=True).strip()
        remote = gh('api', f'repos/{args.repo}/commits/server', '--jq', '.sha')
        if branch != 'server' or commit != remote:
            parser.error('Push and verify the current server branch before completing issues.')
        if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip():
            parser.error('Commit all changes before completing issues.')
    existing = json.loads(gh('issue', 'list', '--repo', args.repo, '--state', 'all', '--limit', '1000', '--json', 'number,body,state'))
    features = json.loads((ROOT/'.github/features.json').read_text())
    for feature in features:
        marker = f'<!-- flesh-feature:{feature["id"]} -->'
        match = next((issue for issue in existing if marker in (issue['body'] or '')), None)
        complete = args.close_implemented and feature['implemented']
        mark = 'x' if complete else ' '
        body = feature['description']+'\n\n## Acceptance criteria\n\n'
        body += '\n'.join(f'- [{mark}] {item}' for item in feature['criteria'])
        body += '\n\n## Verification / current limits\n\n'+feature['verification']
        if complete:
            body += f'\n\nImplemented and verified on `server`: {commit}.'
        body += '\n\n'+marker+'\n'
        # Creating new issues is safe to repeat; existing bodies are only updated
        # when explicitly recording verified implementation completion.
        if not match or complete:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.md') as temp:
                temp.write(body)
                temp.flush()
                if match:
                    gh('issue', 'edit', str(match['number']), '--repo', args.repo, '--body-file', temp.name)
                    url = f'https://github.com/{args.repo}/issues/{match["number"]}'
                else:
                    url = gh('issue', 'create', '--repo', args.repo, '--title', feature['title'], '--body-file', temp.name)
            number = int(url.rstrip('/').split('/')[-1])
            if complete:
                gh('issue', 'close', str(number), '--repo', args.repo, '--reason', 'completed')
            print(('completed' if complete else 'open')+' '+url)
        else:
            print(f'existing https://github.com/{args.repo}/issues/{match["number"]}')


if __name__ == '__main__':
    main()
