import type { SavedRooms } from '../domain.js';
export class StorageConflict extends Error {constructor(){super('Room storage changed in another writer. Retry from the latest state.');this.name='StorageConflict';}}
export interface RoomRepository {load():SavedRooms|undefined;save(state:SavedRooms):void;}
