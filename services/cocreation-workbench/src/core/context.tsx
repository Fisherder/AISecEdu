import { createContext, useContext, useSyncExternalStore } from 'react';
import type { WorkbenchController } from './controller';

export const ControllerContext = createContext<WorkbenchController | null>(null);
export function useWorkbench() {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error('工作台未初始化');
  return { controller, state: useSyncExternalStore(controller.subscribe, controller.snapshot) };
}
