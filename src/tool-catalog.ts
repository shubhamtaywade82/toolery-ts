import type {ToolDefinition} from './types.js';

const object = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)): ToolDefinition['parameters'] => ({
  type: 'object', properties, required, additionalProperties: false,
});

export const TOOL_CATALOG: ToolDefinition[] = [
  {name: 'get_weather', description: 'Get weather for a location and date.', parameters: object({location: {type: 'string'}, date: {type: 'string'}})},
  {name: 'get_crypto_price', description: 'Get the current cryptocurrency price by symbol.', parameters: object({symbol: {type: 'string'}})},
  {name: 'summarize', description: 'Summarize supplied context in the requested format.', parameters: object({format: {type: 'string'}})},
  {name: 'get_account_balance', description: 'Retrieve an account balance from a named account endpoint.', parameters: object({account: {type: 'string'}})},
  {name: 'git_status', description: 'Inspect repository working-tree status without modifying files.', parameters: object({})},
  {name: 'run_tests', description: 'Run the repository test suite and return failures.', parameters: object({filter: {type: 'string'}}, [])},
  {name: 'read_file', description: 'Read a repository file by path.', parameters: object({path: {type: 'string'}})},
  {name: 'search_docs', description: 'Search documentation for a query.', parameters: object({query: {type: 'string'}})},
  {name: 'list_files', description: 'List files under a repository path.', parameters: object({path: {type: 'string'}})},
  {name: 'calculate', description: 'Calculate a deterministic arithmetic expression.', parameters: object({expression: {type: 'string'}})},
  {name: 'lookup_user', description: 'Look up a user by username.', parameters: object({username: {type: 'string'}})},
  {name: 'create_draft', description: 'Create a draft resource without publishing it.', parameters: object({title: {type: 'string'}, body: {type: 'string'}})},
  {name: 'send_message', description: 'Send a message to a recipient.', parameters: object({recipient: {type: 'string'}, message: {type: 'string'}})},
  {name: 'delete_draft', description: 'Delete a draft resource by identifier.', parameters: object({id: {type: 'string'}})},
  {name: 'get_stock_quote', description: 'Retrieve a stock quote by ticker.', parameters: object({symbol: {type: 'string'}})},
  {name: 'get_calendar_events', description: 'List calendar events for a date range.', parameters: object({from: {type: 'string'}, to: {type: 'string'}})},
  {name: 'search_web', description: 'Search the web for a query.', parameters: object({query: {type: 'string'}})},
  {name: 'get_current_time', description: 'Get the current time for a timezone.', parameters: object({timezone: {type: 'string'}})},
];

export const toolByName = new Map(TOOL_CATALOG.map(tool => [tool.name, tool]));
