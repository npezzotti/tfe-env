import prettyMilliseconds from 'pretty-ms';

export function startTimer(): () => string {
  const start = performance.now();
  return () => prettyMilliseconds(performance.now() - start, { secondsDecimalDigits: 2 });
}
