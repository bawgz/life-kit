import { NavLink } from "react-router-dom";
import { useAuth } from "../auth.js";

export default function NavBar() {
  const { logout } = useAuth();
  return (
    <nav className="navbar">
      <div className="navbar-links">
        <NavLink to="/calendar">Calendar</NavLink>
        <NavLink to="/plans">Plans</NavLink>
        <NavLink to="/sessions">Sessions</NavLink>
      </div>
      <button className="link-button" onClick={() => logout()}>
        Sign out
      </button>
    </nav>
  );
}
