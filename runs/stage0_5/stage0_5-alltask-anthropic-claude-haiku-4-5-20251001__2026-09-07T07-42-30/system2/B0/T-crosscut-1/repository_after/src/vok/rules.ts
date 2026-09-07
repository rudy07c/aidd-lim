import { Entity, Operation } from './schema';

export const kindleOne = (entity: Entity): Entity => {
  if (entity.name === 'Zef' || entity.name === 'Tal') {
    return { ...entity, state: 'pex' };
  }
  return entity;
};

export const kindleBoth = (zef: Entity, tal: Entity): [Entity, Entity] => {
  const kindledZef = kindleOne(zef);
  const kindledTal = kindleOne(tal);
  return [kindledZef, kindledTal];
};
