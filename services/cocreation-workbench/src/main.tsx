import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ControllerContext } from './core/context';
import { WorkbenchController } from './core/controller';
import styles from './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="fatal-error">
        <h1>工作台暂时无法显示</h1>
        <p>后台任务仍会继续，刷新后可以重新读取记录。</p>
        <button onClick={() => location.reload()}>重新打开工作台</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const host = document.getElementById('cocreation-workbench');
if (host) {
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = styles;
  shadow.append(style);
  const mount = document.createElement('div');
  mount.id = 'workbench-root';
  shadow.append(mount);
  const controller = new WorkbenchController(host.dataset.ownerId || '');
  createRoot(mount).render(
    <ErrorBoundary>
      <ControllerContext.Provider value={controller}>
        <App />
      </ControllerContext.Provider>
    </ErrorBoundary>,
  );
}
