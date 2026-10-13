import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { HiOutlineMail, HiOutlineLockClosed, HiOutlineUser, HiOutlinePhone, HiOutlineTruck } from 'react-icons/hi';

const getRequestErrorMessage = (error, fallback) =>
  error.response?.data?.message || error.response?.data?.errors?.[0]?.msg || fallback;

const Register = () => {
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    vehicleNumber: '', phoneNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        vehicleNumber: form.vehicleNumber.trim(),
        phoneNumber: form.phoneNumber.trim(),
      });
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(getRequestErrorMessage(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { name: 'name', label: 'Full Name', icon: HiOutlineUser, type: 'text', placeholder: 'John Doe', required: true },
    { name: 'email', label: 'Email', icon: HiOutlineMail, type: 'email', placeholder: 'you@example.com', required: true },
    { name: 'phoneNumber', label: 'Phone Number', icon: HiOutlinePhone, type: 'tel', placeholder: '+91 98765 43210' },
    { name: 'vehicleNumber', label: 'Vehicle Number', icon: HiOutlineTruck, type: 'text', placeholder: 'MH 01 AB 1234' },
    { name: 'password', label: 'Password', icon: HiOutlineLockClosed, type: 'password', placeholder: 'Min 6 characters', required: true },
    { name: 'confirmPassword', label: 'Confirm Password', icon: HiOutlineLockClosed, type: 'password', placeholder: 'Re-enter password', required: true },
  ];

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">P</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create Account</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Join SmartPark today</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((f) => (
                <div key={f.name} className={f.name === 'email' ? 'md:col-span-2' : ''}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    {f.label}
                  </label>
                  <div className="relative">
                    <f.icon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={f.type}
                      className="input-field pl-10"
                      placeholder={f.placeholder}
                      value={form[f.name]}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                      required={f.required}
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50 mt-2"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-semibold">
              Sign In
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Register;
