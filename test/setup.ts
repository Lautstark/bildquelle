// An in-memory IndexedDB, so the storage layer runs for real rather than mocked.
// The invariant tests inspect what actually landed in it.
import 'fake-indexeddb/auto';
