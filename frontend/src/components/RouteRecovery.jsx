import { Component } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CatalogPage from './CatalogPage';

export const RouteRecovery = ({ failed = false }) => {
  const { t } = useTranslation();
  return <CatalogPage><section className="step-view">
    <h1 className="step-h1" tabIndex={-1}>{t(failed ? 'recoveryUi.routeFailed' : 'recoveryUi.unknownRoute')}</h1>
    {failed && <button type="button" className="btn" onClick={() => window.location.reload()}>{t('recoveryUi.reload')}</button>}
    {' '}<Link to="/" className="btn">{t('recoveryUi.home')}</Link>
  </section></CatalogPage>;
};

class Boundary extends Component {
  state = { failed: false, routeKey: null };
  static getDerivedStateFromProps({ routeKey }, state) {
    return routeKey !== state.routeKey ? { failed: false, routeKey } : null;
  }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <RouteRecovery failed /> : this.props.children; }
}

export const RouteErrorBoundary = ({ children }) => {
  const { pathname, search, hash } = useLocation();
  return <Boundary routeKey={`${pathname}${search}${hash}`}>{children}</Boundary>;
};
