// Stryker 무시 규칙: 개발자용 오류 문구(new Error(...), new RangeError(...) 안의 글자)는 돌연변이를 만들지 않는다.
// 문구가 바뀌어도 동작은 같아서, 살아남아도 테스트의 빈틈이 아니다(결과 목록만 길어진다).
// 오류를 던지는지(조건)는 그대로 돌연변이로 확인한다. 화면에 보이는 안내 문구는 무시하지 않는다.

export const strykerPlugins = [
  {
    kind: 'Ignore',
    name: 'error-messages',
    value: {
      shouldIgnore(path) {
        const { node } = path;
        if (
          node.type === 'NewExpression' &&
          node.callee.type === 'Identifier' &&
          node.callee.name.endsWith('Error')
        ) {
          return '개발자용 오류 문구';
        }
        return undefined;
      },
    },
  },
];
