import { TODOS_DOCTYPE } from './todos'
import { TRANSCRIPTIONS_DOCTYPE } from './transcriptions'

// the documents schema, necessary for CozyClient
export default {
  todos: {
    doctype: TODOS_DOCTYPE,
    attributes: {},
    relationships: {}
  },
  transcriptions: {
    doctype: TRANSCRIPTIONS_DOCTYPE,
    attributes: {},
    relationships: {}
  }
}

// export all doctypes for the application
export * from './todos'
export * from './transcriptions'
