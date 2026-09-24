import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth.js";

export default function NavBar() {
  const { logout } = useAuth();
  return (
    <nav className="topnav">
      <div className="topnav-inner">
        <Link to="/plans" className="brand">
          life-kit<span className="dot">.</span>
        </Link>
        <div className="tabs">
          <NavLink to="/plans" className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
            Plans
          </NavLink>
          <NavLink
            to="/calendar"
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >
            Calendar
          </NavLink>
          <NavLink
            to="/sessions"
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >
            History
          </NavLink>
          <button className="signout" onClick={() => logout()}>
            Out
          </button>
        </div>
      </div>
    </nav>
  );
}
