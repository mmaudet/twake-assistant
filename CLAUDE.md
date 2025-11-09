# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Twake Assistant is a Cozy Cloud application built with React. It's a web application that runs inside the Cozy platform, which is a personal cloud environment. The app demonstrates Cozy app development patterns including data persistence using CouchDB doctypes, authentication, and the Cozy Bar integration.

## Cozy Stack Architecture

### What is the Cozy Stack?

The **cozy-stack** is the main backend server for the Cozy platform. It is responsible for:
- Serving and running applications installed on a Cozy instance
- Managing data (creating, updating, deleting documents in CouchDB)
- User and client authentication (OAuth2 support)
- Email delivery and notifications
- Executing server-side jobs (one-time and periodic)
- Database replication for mobile sync
- Sandboxed execution of connectors (third-party data importers)

### Application Security Model

**Subdomain Isolation**: Each app runs on its own subdomain (e.g., `twake-assistant.cozy.tools:8080` instead of `/apps/twake-assistant`) to leverage the browser's Same Origin Policy. This prevents apps from stealing authentication tokens from other apps.

**Token Injection**: Authentication tokens are injected into the application's HTML via template variables (`{{.Token}}`), making them available only to the running app, not to other origins.

### Application Lifecycle

Applications progress through these states:
- `installing` - Being downloaded and set up
- `installed` - Awaiting user permission acceptance
- `ready` - Fully operational and usable
- `upgrading` - Being updated to a new version
- `errored` - Installation or runtime error occurred

### Application Routes

Routes in `manifest.webapp` map URL paths to file folders:
- **Exact path matches** (e.g., `/admin`) use the index file as an HTML template with variable injection
- **Partial matches** serve files directly from the folder
- **Public vs Private**: Routes can be public (no auth) or private (requires authentication)

Example:
```json
"/admin": { "folder": "/", "index": "admin.html", "public": false },
"/public": { "folder": "/public", "public": true }
```

### Services (Background Processes)

Services are Node.js background processes that:
- Run with the same permissions as the web app
- Analyze existing data without user interaction
- Can emit notifications
- Are triggered via cron expressions or programmatic calls
- Defined in `manifest.webapp` under the `services` key

### Permission System

Permissions control access across three contexts:
1. Client-side apps
2. OAuth2 external applications
3. Inter-user sharing

**Permission Components:**
- **type** (required): Doctype (e.g., `io.cozy.files`). Wildcards supported: `io.cozy.bank.*`
- **verbs**: HTTP methods (e.g., `["GET"]`, `["ALL"]`). `HEAD` is implicit with `GET`
- **values**: Restricts to specific document IDs
- **selector**: Filters on alternate fields (useful for calendar events, folder contents)

**Permission Formats:**
- **JSON**: Standard format in manifest files
- **Inline (OAuth2)**: Space-delimited, colon-separated strings

**Key Permission APIs:**
- `GET /permissions/self` - List current token permissions
- `POST /permissions` - Create shareable permission sets with codes/TTLs
- `PATCH /permissions/:id` - Modify permissions
- `DELETE /permissions/:id` - Revoke permissions

### Jobs & Triggers System

**Jobs** are asynchronous tasks executed by the Cozy instance. **Triggers** define conditions that automatically create jobs.

**Trigger Types:**
- `@at` - One-time execution at specific timestamp (ISO-8601)
- `@in` - Delayed execution after duration
- `@daily`, `@weekly`, `@monthly` - Recurring schedules
- `@every` - Fixed interval (e.g., "30m10s")
- `@cron` - Traditional cron syntax
- `@event` - Triggered by document changes (create/update/delete)
- `@webhook` - Activated by HTTP requests
- `@client` - Manually triggered by client apps

**Job Features:**
- Queue-based architecture (local or distributed via Redis)
- Configurable retry mechanisms (default: 3 attempts)
- Timeouts (default: 60 seconds)
- Error logging in job document
- Per-worker type permissions

**Job APIs:**
- `POST /jobs/queue/:worker-type` - Create a job
- `GET/POST /jobs/triggers` - Manage triggers
- Monitor job status and history

### Asset Caching

Files with ≥10-character hex identifiers in basename (e.g., `app.badf00d.js`) are treated as immutable with long cache-control headers for optimal performance.

### Installation Sources

Apps can be installed from:
- `registry://` - Official Cozy registry
- `git://` - Git repositories (with branch support)
- `http(s)://` - Tarballs
- `file://` - Local directories

Installation via `POST /apps/:slug` returns 202 Accepted with an `io.cozy.apps` document tracking progress.

## Development Commands

**Setup:**
```bash
yarn install
```

**Development (browser):**
```bash
yarn start                    # Start dev server with HMR at http://twake-assistant.cozy.tools:8080
yarn watch                    # Watch mode for browser (alias: yarn watch:browser)
yarn stack:docker:dev         # Run Cozy stack in Docker (run in separate terminal after yarn start)
```

**Development (mobile):**
```bash
yarn watch:mobile             # Watch mode for mobile builds
```

**Build:**
```bash
yarn build                    # Build for browser (runs lint first)
yarn build:browser            # Browser-specific build
yarn build:mobile             # Mobile-specific build
```

**Testing:**
```bash
yarn test                     # Run Jest tests with coverage
```

**Linting:**
```bash
yarn lint                     # Run all linters (JS + styles)
yarn lint:js                  # Lint JavaScript/JSX files
yarn lint:styles              # Lint Stylus files
```

**Note:** The build command runs linting as a prebuild step, so builds will fail if linting fails.

## Architecture

### Stack & Tools

- **Build System:** `cozy-scripts` (aliased as `cs`) - Cozy's wrapper around webpack and other build tools
- **Framework:** React 18 with React Router v6 (using HashRouter)
- **State Management:** `cozy-client` for data fetching and CouchDB interaction
- **UI Library:** `cozy-ui` for components and styling (Material-UI based)
- **Styling:** Stylus for custom styles, combined with cozy-ui's CSS
- **Testing:** Jest with React Testing Library

### Entry Points

**Browser target:** `src/targets/browser/index.jsx`
- Initializes the React app with all necessary providers (CozyProvider, I18n, MuiCozyTheme, etc.)
- Sets up HMR (Hot Module Replacement)
- Uses `setupApp()` from `src/targets/browser/setupApp.jsx` for initialization

**Key initialization flow:**
1. `setupApp()` is memoized and extracts Cozy context from `data-cozy` attribute
2. Creates CozyClient instance with schema and auth token
3. Initializes cozy-bar (the top navigation bar shared across Cozy apps)
4. Returns client, container, lang, and polyglot for i18n

### Routing Structure

Defined in `src/components/AppRouter.jsx`:
- `/todos` - Main todo list view (default route)
- `/viewhello1` - Demo view 1
- `/viewhello2` - Demo view 2
- All other routes redirect to `/todos`

Layout is managed by `src/components/AppLayout.jsx` which includes the Sidebar.

### Data Layer (Cozy Client)

**Doctype Definition:** `src/doctypes/index.js` and `src/doctypes/todos.js`
- Uses CouchDB-style doctypes
- Current doctype: `io.mocks.todos` (demo data)
- Schema exported to CozyClient in `src/utils/client.js`

**Queries:** Defined in `src/utils/queries.js`
- Uses cozy-client's `Q()` query builder
- Example: `getAllTodos` query definition with options

**Client Setup:** `src/utils/client.js`
- Creates CozyClient with URI, token from Cozy context
- Configures app metadata from `manifest.webapp`
- Schema configuration for doctypes

### CozyClient & Stack Communication

**CozyClient** is the JavaScript SDK for interacting with the Cozy stack. It provides:
- Authentication with a Cozy instance
- Querying and caching documents
- Transparent relations between CouchDB documents
- Offline capabilities through PouchDB
- React integration with hooks and HOCs

**Installation:**
```bash
yarn add cozy-client
```

**Client Initialization Methods:**

```javascript
// Method 1: Manual initialization (used in src/utils/client.js)
import CozyClient from 'cozy-client'

const client = new CozyClient({
  uri: 'http://cozy.tools:8080',
  token: 'your-auth-token',
  schema: schemaDefinition,
  store: false  // or true to use internal Redux store
})

// Method 2: DOM-based initialization (extracts from [role=application])
const client = CozyClient.fromDOM({ schema })
```

**React Integration:**

The app uses `CozyProvider` to make the client available throughout the component tree:

```javascript
import { CozyProvider } from 'cozy-client'

<CozyProvider client={client}>
  <YourApp />
</CozyProvider>
```

**Available React Hooks:**
- `useClient()` - Access the CozyClient instance
- `useQuery(queryDef, options)` - Fetch data with caching
- `useQueryAll(queryDef)` - Fetch all documents (handles pagination)
- `useMutation()` - Manage document saves with status tracking
- `useSettings()` - Handle app settings
- `useCapabilities()` - Check instance features
- `useInstanceInfo()` - Retrieve instance metadata

**Query Definition Builder:**

Use the `Q()` helper to construct queries:

```javascript
import { Q } from 'cozy-client'

const queryDef = Q('io.cozy.todos')
  .where({ checked: false })
  .select(['title', 'checked'])          // Select specific fields
  .include(['dependencies'])              // Include relationships
  .sortBy([{'cozyMetadata.updatedAt': 'desc'}])
  .limitBy(20)
  .offsetBookmark(bookmark)               // For pagination
```

**Fetch Policies:**

Prevent redundant network requests by caching fresh data:

```javascript
const { data } = useQuery(queryDef, {
  as: 'checked-todos',  // Named query for cache sharing
  fetchPolicy: CozyClient.fetchPolicies.olderThan(30 * 1000)  // Cache for 30s
})
```

**Batch Operations:**

Save multiple documents at once:

```javascript
const { data: updatedDocs } = await client.saveAll([
  { _type: 'io.cozy.todos', label: 'Buy milk', checked: true },
  { _type: 'io.cozy.todos', label: 'Make dinner', checked: false }
])
```

**CozyClient Plugins:**

Extended functionality through plugins:
- **Realtime**: Server-side change notifications for live updates
- **InterApp**: Cross-app communication (e.g., file picking)
- **Flag**: Feature flag management

**Direct Stack API Access (HTTP):**

While cozy-client abstracts most operations, you can make direct HTTP calls to the stack:

**Endpoints:**
- `GET /data/:type/:id` - Retrieve a document
- `POST /data/:type/` - Create a document
- `PUT /data/:type/:id` - Update a document (requires `_rev`)
- `DELETE /data/:type/:id?rev=:rev` - Delete a document
- `POST /data/:type/_all_docs` - Bulk retrieval with keys array
- `GET /data/:type/_normal_docs` - Paginated list (excludes design docs)

**HTTP Headers Required:**
- `Authorization: Bearer {{.Token}}`
- `Content-Type: application/json`

**Example direct API call:**

```javascript
const response = await fetch(`${cozyUrl}/data/io.cozy.todos/${docId}`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  credentials: 'include'
})
const doc = await response.json()
```

**Important Notes:**
- All documents include `_id`, `_type`, and `_rev` fields
- `_rev` is required for updates and deletes (conflict prevention)
- Updates with mismatched `_rev` return 409 Conflict errors
- The stack auto-generates `_id` for new documents
- Use cozy-client methods instead of direct HTTP when possible for caching and state management

**Real-Time Updates:**

Subscribe to doctype changes for live UI updates:

```javascript
import { RealTimeQueries } from 'cozy-client'

<RealTimeQueries doctype="io.cozy.todos" />
```

This automatically refreshes queries when documents change.

**Testing with Mock Client:**

For unit tests, create a mock client with predefined data:

```javascript
import { createMockClient } from 'cozy-client'

const mockClient = createMockClient({
  queries: {
    'todos': { data: mockTodoData }
  }
})
```

**Cozy Stack Services:**

The Cozy stack provides many additional services beyond data storage:

- **Authentication** (`/auth`) - User authentication, OAuth, delegated auth (OIDC)
- **Apps** (`/apps`) - Application installation and management
- **Files** (`/files`) - Virtual File System (VFS) with file synchronization
- **Jobs** (`/jobs`) - One-time and periodic job scheduling
- **Realtime** (`/realtime`) - WebSocket-based real-time notifications
- **Sharings** (`/sharings`) - Data sharing between Cozy instances
- **Permissions** (`/permissions`) - Permission management and verification
- **Settings** (`/settings`) - Instance configuration and settings
- **Notifications** - Push notifications and email delivery

**Key Stack Concepts:**

- **Jobs & Workers**: Background tasks for connectors, data import, scheduled operations
- **Triggers**: Execute jobs on schedule or events (cron, @event, @webhook)
- **Connectors**: Sandboxed third-party data importers
- **Replication**: Database synchronization between devices

**Higher-Order Components (for class components):**

If you need to work with class components instead of hooks:

```javascript
import { withClient, queryConnect, withMutation } from 'cozy-client'

// Access client in class component
export default withClient(MyComponent)

// Connect queries to class component
export default queryConnect({
  todos: { query: () => Q('io.cozy.todos'), as: 'todos' }
})(MyComponent)

// Add mutation capabilities
export default withMutation()(MyComponent)
```

### Data Manipulation & Queries

Cozy uses **CouchDB** (document-oriented NoSQL database) with **Mango queries** as the primary query system.

**Document Structure:**
- All documents have mandatory `_id` and `_rev` fields (automatically handled by CouchDB)
- Documents are stored as JSON objects in doctype-specific databases

**CRUD Operations:**

```javascript
// CREATE - Use client.save() with _type field
const client = useClient();
await client.save({
  _type: TODOS_DOCTYPE,
  name: "New todo",
  category: "sport"
});

// READ - Use queries (see query patterns below)
const { data } = useQuery(queryDef.definition, queryDef.options);

// UPDATE - Use client.save() with existing document (must include _id and _rev)
await client.save({
  ...existingTodo,
  name: "Updated name"
});

// DELETE - Use client.destroy()
await client.destroy(todo);  // Pass the entire document object
```

**Basic Query Patterns:**

```javascript
// Simple query - retrieve all documents
const docs = await client.queryAll(Q("io.cozy.todos"));

// Query with filtering
const queryDef = Q("io.cozy.todos").where({
  category: "sport",
  title: "Exercices"
});

// Using the useQuery hook in components
const { data, ...rest } = useQuery(queryDef.definition, queryDef.options);
```

**Query Operators:**
- Condition operators: `$eq`, `$gt`, `$lt`, `$gte`, `$lte`, `$ne`
- Combination operators: `$and`, `$or`, `$not`
- Existence operators: `$exists`

**Indexing (Critical for Performance):**

Indexes are mandatory for fields used in `where()` or `sortBy()` clauses:

```javascript
const queryDef = client
  .find("io.cozy.todos")
  .where({ category: "sport" })
  .indexFields(["category"]);  // REQUIRED for query to be efficient
```

**Important indexing rules:**
- All indexed fields must exist in the document for it to be indexed
- Documents without indexed fields won't appear in queries (even with `$exists: false`)
- CouchDB uses B+ Trees with O(log n) lookup time (vs O(n) for full scans)
- Indexes are updated on reads, not writes
- For combined conditions, index equality fields first: `["category", "created_at"]` not `["created_at", "category"]`
- Don't create unnecessary indexes - they impact performance

**Sorting:**

```javascript
.sortBy([{ category: "asc" }, { created_at: "desc" }])
```

Sort order: null → booleans → numbers → strings → arrays → objects

**Pagination:**

Use bookmark-based pagination for large datasets (never use skip/offset):

```javascript
let resp = { next: true };
let docs = [];
while (resp?.next) {
  resp = await client.query(
    Q("io.cozy.todos").limitBy(200).offsetBookmark(resp.bookmark)
  );
  docs.push(...resp.data);
}
```

Or use `queryAll()` to automatically handle pagination:

```javascript
const docs = await client.queryAll(Q("io.cozy.todos"));
```

**PouchDB & Offline Support:**

PouchDB is used in desktop and mobile apps for offline functionality:
- Maintains a local database that syncs with CouchDB server
- Enables offline support and improves performance
- Processes queries in two phases: load candidates, then filter
- Proper indexing is even more critical for PouchDB performance

**Debugging PouchDB queries:**
```javascript
PouchDB.debug.enable("pouchdb:find");
```

**DocType Naming Conventions:**
- Standard Cozy types: `io.cozy.*` (e.g., `io.cozy.contacts`, `io.cozy.files`)
- Third-party integrations: Reverse domain format (e.g., `com.bitwarden.ciphers`)
- Custom/mock types: Follow existing patterns (e.g., `io.mocks.todos`)

**Performance Best Practices:**
- Always create indexes before querying
- Avoid JavaScript views (extremely slow) - use Mango queries instead
- Use bookmark pagination, never skip/offset
- Filter on indexed fields only
- Narrow results with indexed fields, then filter in application code if needed
- Be mindful of missing field issues when querying

### Component Structure

Components follow Cozy conventions:
- Feature-based organization (e.g., `src/components/Todos/`)
- Co-located tests (`.spec.jsx` files next to components)
- Mock data in `__mocks__/` subdirectories

**Key patterns:**
- Use `useQuery()` hook from cozy-client for data fetching
- Use `isQueryLoading()` to handle loading states
- Components are functional with hooks (no class components)

### Cozy-Specific Concepts

**Manifest:** `manifest.webapp`
- Defines app metadata, permissions, routes
- Permissions include CouchDB doctype access
- Used by Cozy stack to configure the app

**Permission Structure:**
Each permission in the manifest requires:
- `type`: Document type (e.g., `io.cozy.files`, `io.mocks.todos`)
- `verbs`: Array of HTTP methods (e.g., `["GET", "POST", "PUT", "DELETE"]`)
- Optional `selector`: Attribute to limit scope
- Optional `values`: Array of allowed values for scoped access
- `description`: User-facing explanation of why permission is needed

**Template Variables:**
The Cozy stack injects variables into the HTML at runtime using `{{variable}}` syntax:
- `{{.Domain}}` - Cozy instance domain (API endpoint base URL)
- `{{.Token}}` - Authentication token for API requests
- `{{.Locale}}` - User's preferred language
- `{{.CozyBar}}` - Cozy Bar navigation component HTML
- `{{.ThemeCSS}}` - Theme-specific styling

The app extracts these from the `data-cozy` attribute on the `[role=application]` element.

**Cozy Bar:** Navigation bar shared across all Cozy apps
- Initialized in `src/utils/bar.js`
- Provides app switching, settings access

**CozyProvider:** Required wrapper for all Cozy apps
- Provides CozyClient context to components
- Must wrap entire app tree

**Localization:**
- Files in `src/locales/` (en.json, fr.json)
- Managed via Transifex
- Initialized with polyglot in setupApp

### Testing Configuration

**Jest config:** `jest.config.js`
- Module resolution configured for `src/` and `test/` aliases
- Transforms ignore cozy-ui (must be transpiled)
- Global mocks for images and Stylus files
- Test setup in `test/jestLib/setup.js`

**Path aliases:**
- `src/*` maps to `<rootDir>/src/*`
- `test/*` maps to `<rootDir>/test/*`

### Styling

- Main styles in `src/styles/index.styl`
- Must import cozy-ui CSS in entry point
- Material-UI class names are non-deterministic due to cozy-bar multi-root setup

## Important Development Notes

**Running with Docker:**
- Start app with `yarn start` in one terminal
- Start Cozy stack with `yarn stack:docker:dev` in another terminal
- Access at http://twake-assistant.cozy.tools:8080
- HMR is enabled in dev mode (CSP disabled for development)
- For production-like testing: `yarn build` then `yarn stack:docker:prod`

**Working with cozy-ui locally:**
If you need to modify cozy-ui:
```bash
# In cozy-ui repo
yarn link

# In this repo
yarn link cozy-ui
```

**Module imports:**
- Use `src/` prefix for internal imports (configured in Jest and webpack)
- Import cozy-ui from transpiled path: `cozy-ui/transpiled/react/*`

**Doctypes:**
- Check https://cozy.github.io/cozy-doctypes/ for standard doctypes before creating custom ones
- Define schema in `src/doctypes/`
- Add permissions in `manifest.webapp`

**Alternative Docker Setup:**
You can also run the app using the official `cozy/cozy-app-dev` Docker image:
```bash
docker run -ti --rm -p 8080:8080 -p 5984:5984 -p 8025:8025 \
  -e COZY_DISABLE_CSP=1 \
  -v $(pwd)/build:/data/cozy-app/twake-assistant \
  cozy/cozy-app-dev
```
Access the app at http://twake-assistant.cozy.localhost:8080

**Security Considerations:**

*Development:*
- CSP (Content Security Policy) is disabled via `COZY_DISABLE_CSP=1` for webpack-dev-server compatibility
- This is only for development; CSP must be re-enabled in production

*API Requests:*
- All API calls require `Authorization: Bearer {{.Token}}` header
- Include `credentials: 'include'` in fetch requests for cookie handling
- Session cookies are HttpOnly for security

*Production builds:*
- Never disable CSP in production environments
- Ensure all API requests properly handle authentication tokens
- Test production builds with `yarn build` + `yarn stack:docker:prod` before deploying
