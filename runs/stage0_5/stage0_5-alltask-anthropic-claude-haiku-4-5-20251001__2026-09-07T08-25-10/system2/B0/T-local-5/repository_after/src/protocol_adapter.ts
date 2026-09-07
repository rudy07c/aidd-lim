import { WorldProtocol } from './world_protocol';
import { OperationFactory } from './operations';
import { EntityState } from './entity';
import { rules } from './vok/rules';

const operationFactory = new OperationFactory();

// Register operations from rules
const moveZefToDorOp = rules.moveZefToDor(operationFactory);
const recoverZefOp = rules.recoverZef(operationFactory);

const operations: { [key: string]: any } = {
  moveZefToDor: moveZefToDorOp,
  recoverZef: recoverZefOp,
};

const protocol = new WorldProtocol(operations);

export { protocol };
export const reset = () => protocol.reset();
export const applyOperation = (operationName: string, ...args: any[]) => protocol.applyOperation(operationName, ...args);
export const getEntityState = () => protocol.getEntityState();
export const toAbstractSnapshot = () => protocol.toAbstractSnapshot();
