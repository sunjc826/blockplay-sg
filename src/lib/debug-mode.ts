import { createContext, useContext } from 'react';

/**
 * Whether game views show their developer panels (debug survival, AI pilot,
 * comms log, district intel, on-screen pads). On by default so the `/debug`
 * shell, unit tests and browser smokes see everything; the player menu turns
 * it off for its screens.
 */
export const DebugMode = createContext(true);
export const useDebugMode = () => useContext(DebugMode);
