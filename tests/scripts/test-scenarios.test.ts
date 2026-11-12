// 회귀 테스트 시나리오 목록(docs/test-scenarios.md)이 실제 테스트와 맞는지 본다.
// ✅ 줄이 가리키는 테스트가 정말 있어야 한다. 테스트 이름을 바꾸거나 지우면 여기서 실패하니 목록도 같이 고친다.
// 목록이 "자동으로 지킨다"고 말하는데 테스트가 없어지는 일(테스트가 낡는 것)을 막는다.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DOC_PATH = 'docs/test-scenarios.md';
const STATUSES = ['✅', '⏳', '🖐'] as const;

type TestRef = { path: string; title: string };
type Scenario = { id: string; status: string; refs: TestRef[]; raw: string };

/** 시나리오 표의 줄(첫 칸이 ID인 줄)을 읽는다 */
function readScenarios(doc: string): Scenario[] {
  return doc
    .split('\n')
    .filter((line) => /^\| [A-Z]+-\d{2} \|/.test(line))
    .map((line) => {
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim());
      const [id, , , status, tests = ''] = cells;
      const refs = tests
        .split('<br>')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const match = entry.match(/^`([^`]+)`\s*(.*)$/);
          if (!match) throw new Error(`${id}: 테스트 칸 모양이 틀려요("\`파일\` 이름 일부"): ${entry}`);
          return { path: match[1], title: match[2].trim() };
        });
      return { id, status, refs, raw: line };
    });
}

/** 테스트 파일의 it·test·describe 이름들. 줄이 바뀐 이름도 읽는다 */
function testTitles(source: string): string[] {
  const titles: string[] = [];
  const pattern =
    /\b(?:describe|describeDb|it|test)(?:\.each\([^)]*\))?\(\s*(['"`])((?:\\[\s\S]|(?!\1)[\s\S])*)\1/g;
  for (const match of source.matchAll(pattern)) titles.push(match[2].replace(/\\(['"`])/g, '$1'));
  return titles;
}

const doc = readFileSync(`${ROOT}${DOC_PATH}`, 'utf8');
const scenarios = readScenarios(doc);

describe('회귀 테스트 시나리오 목록 (docs/test-scenarios.md)', () => {
  it('시나리오가 있고 ID가 겹치지 않는다', () => {
    expect(scenarios.length).toBeGreaterThan(0);
    const ids = scenarios.map((scenario) => scenario.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index), '겹치는 ID').toEqual([]);
  });

  it('상태는 ✅·⏳·🖐 중 하나이고, ✅ 줄에는 테스트가 하나 이상 있다', () => {
    const wrongStatus = scenarios.filter(
      (scenario) => !(STATUSES as readonly string[]).includes(scenario.status),
    );
    expect(
      wrongStatus.map((scenario) => scenario.id),
      '상태 칸이 ✅·⏳·🖐가 아니에요',
    ).toEqual([]);
    const automatedWithoutTest = scenarios.filter(
      (scenario) => scenario.status === '✅' && scenario.refs.length === 0,
    );
    expect(
      automatedWithoutTest.map((scenario) => scenario.id),
      '✅인데 테스트가 없어요. 테스트를 적거나 ⏳로 바꿔 주세요',
    ).toEqual([]);
  });

  it('목록이 가리키는 테스트 파일과 테스트 이름이 정말 있다', () => {
    const missing: string[] = [];
    const sources = new Map<string, string[]>();
    for (const scenario of scenarios) {
      for (const ref of scenario.refs) {
        if (!/\.test\.tsx?$/.test(ref.path)) {
          missing.push(`${scenario.id}: 테스트 파일이 아니에요: ${ref.path}`);
          continue;
        }
        if (!sources.has(ref.path)) {
          const file = `${ROOT}${ref.path}`;
          sources.set(ref.path, existsSync(file) ? testTitles(readFileSync(file, 'utf8')) : []);
        }
        const titles = sources.get(ref.path) ?? [];
        if (titles.length === 0) {
          missing.push(`${scenario.id}: 파일이 없거나 테스트가 없어요: ${ref.path}`);
        } else if (ref.title && !titles.some((title) => title.includes(ref.title))) {
          missing.push(`${scenario.id}: ${ref.path}에 "${ref.title}"가 든 테스트 이름이 없어요`);
        }
      }
    }
    expect(
      missing,
      '테스트 이름을 바꿨거나 지웠으면 docs/test-scenarios.md도 같이 고쳐 주세요',
    ).toEqual([]);
  });
});
