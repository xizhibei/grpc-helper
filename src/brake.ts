import * as Brakes from 'brakes';

export function wrapWithBrake(func: (...args) => any, brake) {
  const method = brake.slaveCircuit(func);
  return async function(...args) {
    return method.exec(...args);
  };
}
