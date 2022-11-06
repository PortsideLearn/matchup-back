import type { ModelType } from '@typegoose/typegoose/lib/types'
import type { Query } from '../../index'

import { DTO } from '../../../../Classes/DTO/DTO'
import { TechnicalCause, TechnicalError } from '../../../../error'

export async function set(model: ModelType<any>, request: DTO) {
  let query = request.content.query as unknown as Query
  if (!query.update)
    throw new TechnicalError('query.update', TechnicalCause.REQUIRED)
  if (typeof query.update != 'object')
    throw new TechnicalError('query.update', TechnicalCause.INVALID_FORMAT)

  switch (query.update.count) {
    case 'one':
      await model.updateOne(query.filter, query.update.set)
      return true

    case 'many':
      await model.updateMany(query.filter, query.update.set)
      return true

    default:
      throw new TechnicalError('query count', TechnicalCause.INVALID_FORMAT)
  }
}