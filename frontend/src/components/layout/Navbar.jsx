import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { getSocket } from '../../services/socket';
import {
  HiOutlineMenu, HiOutlineX, HiOutlineMoon, HiOutlineSun,
  HiOutlineBell, HiOutlineUser, HiOutlineLogout,
  HiOutlineCheck, HiOutlineTrash,
} from 'react-icons/hi';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef(null);
  const navigate = useNavigate();

  // Fetch unread notification count
  useEffect(() => {
    if (!isAuthenticated) { setUnreadCount(0); return; }
    const fetchUnread = async () => {
      try {
        const res = await api.get('/notifications/unread-count');
        setUnreadCount(res.data.count || 0);
      } catch { setUnreadCount(0); }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Listen for real-time notification pushes
  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = getSocket();
    if (!socket) return;
    const handler = (data) => {
      setUnreadCount((prev) => prev + 1);
      // Prepend new notification to list if dropdown is open
      if (data) {
        setNotifications((prev) => [data, ...prev].slice(0, 20));
      }
    };
    socket.on('newNotification', handler);
    return () => socket.off('newNotification', handler);
  }, [isAuthenticated]);

  // Close notification dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications when dropdown opens
  const toggleNotifications = async () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    setProfileOpen(false);
    if (opening) {
      setNotifLoading(true);
      try {
        const res = await api.get('/notifications');
        setNotifications(res.data.data || []);
        setUnreadCount(res.data.unreadCount || 0);
      } catch {
        try {
          const res = await api.get('/auth/notifications');
          setNotifications(res.data.notifications || []);
          setUnreadCount((res.data.notifications || []).filter((n) => !n.read).length);
        } catch {
          setNotifications([]);
        }
      } finally {
        setNotifLoading(false);
      }
    }
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      try {
        await api.put('/auth/notifications/read');
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      } catch {}
    }
  };

  const markOneRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const handleDeleteNotif = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
    } catch {}
  };

  const handleNotifClick = (n) => {
    if (!n.read) markOneRead(n._id);
    if (n.link) { setNotifOpen(false); navigate(n.link); }
  };

  const getTypeIcon = (type) => {
    const icons = { booking: '🎫', payment: '💳', reminder: '⏰', system: '🔔', review: '⭐', checkin: '📍' };
    return icons[type] || '🔔';
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    setProfileOpen(false);
  };

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Parking', path: '/parking' },
    { name: 'Nearby', path: '/nearby' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-white/80 dark:bg-dark-card/80 backdrop-blur-lg border-b border-gray-200 dark:border-dark-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-card" aria-label="SmartPark home">
            <img
              src="/images/smartpark-favicon.png"
              alt=""
              className="h-12 w-12 rounded-lg object-cover"
            />
            <span className="flex flex-col leading-none">
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Smart<span className="text-primary-600 dark:text-primary-400">Park</span>
              </span>
              <span className="mt-1 text-[7px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                Intelligent Parking Management System
              </span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-colors"
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-border transition-colors"
            >
              {darkMode ? <HiOutlineSun size={20} /> : <HiOutlineMoon size={20} />}
            </button>

            {isAuthenticated ? (
              <>
                {/* Notification Bell + Dropdown */}
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={toggleNotifications}
                    className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-border transition-colors relative"
                  >
                    <HiOutlineBell size={20} />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>

                  <AnimatePresence>
                    {notifOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-dark-card rounded-xl shadow-2xl border border-gray-100 dark:border-dark-border z-50 overflow-hidden"
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-dark-border">
                          <h3 className="font-bold text-sm text-gray-900 dark:text-white">Notifications</h3>
                          {unreadCount > 0 && (
                            <button
                              onClick={markAllRead}
                              className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                            >
                              <HiOutlineCheck size={14} /> Mark all read
                            </button>
                          )}
                        </div>

                        {/* List */}
                        <div className="max-h-80 overflow-y-auto">
                          {notifLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                          ) : notifications.length > 0 ? (
                            notifications.slice(0, 20).map((n, i) => (
                              <div
                                key={n._id || i}
                                onClick={() => handleNotifClick(n)}
                                className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border/50 transition-colors group ${
                                  !n.read ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''
                                }`}
                              >
                                <span className="text-lg mt-0.5">{getTypeIcon(n.type)}</span>
                                <div className="flex-1 min-w-0">
                                  {n.title && (
                                    <p className={`text-xs font-semibold truncate ${!n.read ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                      {n.title}
                                    </p>
                                  )}
                                  <p className={`text-xs leading-relaxed ${!n.read ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>
                                    {n.message?.length > 80 ? n.message.slice(0, 80) + '…' : n.message}
                                  </p>
                                  <p className="text-[10px] text-gray-400 mt-0.5">
                                    {new Date(n.createdAt).toLocaleString()}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {!n.read && <div className="w-2 h-2 bg-primary-500 rounded-full" />}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteNotif(n._id); }}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition p-0.5"
                                  >
                                    <HiOutlineTrash size={14} />
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="py-8 text-center text-gray-400">
                              <HiOutlineBell size={28} className="mx-auto mb-2 text-gray-300" />
                              <p className="text-sm">No notifications</p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="relative">
                  <button
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-border transition-colors"
                  >
                    <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                      {user?.name?.charAt(0)?.toUpperCase()}
                    </div>
                  </button>

                  {profileOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute right-0 mt-2 w-56 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-dark-border py-2 z-50"
                    >
                      <div className="px-4 py-2 border-b border-gray-100 dark:border-dark-border">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{user?.name}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                      </div>
                      <Link
                        to={user?.role === 'admin' ? '/admin' : '/dashboard'}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border"
                        onClick={() => setProfileOpen(false)}
                      >
                        <HiOutlineUser size={16} />
                        {user?.role === 'admin' ? 'Admin Panel' : 'Dashboard'}
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 w-full"
                      >
                        <HiOutlineLogout size={16} />
                        Logout
                      </button>
                    </motion.div>
                  )}
                </div>
              </>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Link to="/login" className="btn-secondary text-sm py-2 px-4">
                  Login
                </Link>
                <Link to="/register" className="btn-primary text-sm py-2 px-4">
                  Sign Up
                </Link>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300"
            >
              {mobileOpen ? <HiOutlineX size={24} /> : <HiOutlineMenu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="md:hidden border-t border-gray-100 dark:border-dark-border py-4"
          >
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="block py-2.5 px-2 text-gray-600 dark:text-gray-300 hover:text-primary-600 font-medium"
                onClick={() => setMobileOpen(false)}
              >
                {link.name}
              </Link>
            ))}
            {!isAuthenticated && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-dark-border">
                <Link to="/login" className="btn-secondary text-sm flex-1 text-center" onClick={() => setMobileOpen(false)}>
                  Login
                </Link>
                <Link to="/register" className="btn-primary text-sm flex-1 text-center" onClick={() => setMobileOpen(false)}>
                  Sign Up
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
