import type { ChartController } from './controller'

/** Контроллеры графиков по номеру панели — чтобы горячие клавиши могли обращаться к активному */
const controllers = new Map<number, ChartController>()

export function registerChart(index: number, ctrl: ChartController): () => void {
  controllers.set(index, ctrl)
  return () => {
    if (controllers.get(index) === ctrl) controllers.delete(index)
  }
}

export const chartAt = (index: number) => controllers.get(index)
