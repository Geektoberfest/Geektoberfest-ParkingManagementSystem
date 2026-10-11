import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from '../../services/api';

const Footer = () => {
  const [content, setContent] = useState(null);

  useEffect(() => {
    const fetchFooter = async () => {
      try {
        const res = await api.get('/cms/footer');
        setContent(res.data.data);
      } catch {
        // Use defaults
      }
    };
    fetchFooter();
  }, []);

  const description = content?.companyDescription || 'Find, book, and manage parking effortlessly with real-time availability and smart technology.';
  const contactInfo = content?.contactInfo || {
    address: 'Smart City Tower, Sector 42',
    phone: '+91 98765 43210',
    email: 'support@smartpark.com',
  };
  const copyright = (content?.copyright || '© {year} SmartPark. All rights reserved.').replace('{year}', new Date().getFullYear());

  const quickLinks = [
    { label: 'Find Parking', to: '/parking' },
    { label: 'Nearby Parking', to: '/nearby' },
    { label: 'About Us', to: '/about' },
    { label: 'Contact', to: '/contact' },
    { label: 'FAQ', href: '/#faq' },
  ];

  const services = [
    'Online Booking',
    'Real-Time Tracking',
    'QR Code Entry',
    'Digital Payments',
    'Smart Notifications',
  ];

  return (
    <footer className="bg-gray-950 text-gray-400">
      {/* Main footer grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div>
            <Link to="/" className="mb-4 flex h-20 w-52 items-center justify-center rounded-lg bg-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950" aria-label="SmartPark home">
              <img
                src="/images/smartpark-logo.png"
                alt="SmartPark"
                className="h-20 w-52 scale-[1.35] object-contain"
              />
            </Link>
            <p className="text-sm leading-relaxed">{description}</p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">Quick Links</h4>
            <ul className="space-y-2.5">
              {quickLinks.map((link, i) => (
                <li key={i}>
                  {link.href ? (
                    <a href={link.href} className="text-sm hover:text-white transition-colors">
                      {link.label}
                    </a>
                  ) : (
                    <Link to={link.to} className="text-sm hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Our Services */}
          <div>
            <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">Our Services</h4>
            <ul className="space-y-2.5">
              {services.map((svc, i) => (
                <li key={i} className="text-sm text-gray-400">{svc}</li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">Get in Touch</h4>
            <ul className="space-y-3 text-sm">
              <li>{contactInfo.address}</li>
              <li>
                <a href={`tel:${contactInfo.phone}`} className="hover:text-white transition-colors">
                  {contactInfo.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${contactInfo.email}`} className="hover:text-white transition-colors">
                  {contactInfo.email}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
            <span>{copyright}</span>
            <div className="flex items-center gap-3">
              <a href="/#faq" className="hover:text-gray-300 transition-colors">FAQ</a>
              <span>·</span>
              <Link to="/contact" className="hover:text-gray-300 transition-colors">Contact</Link>
              <span>·</span>
              <Link to="/about" className="hover:text-gray-300 transition-colors">About</Link>
              <span>·</span>
              <span>Privacy Policy</span>
              <span>·</span>
              <span>Terms of Service</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
