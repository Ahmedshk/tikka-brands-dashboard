import { useCallback, useEffect, useRef, useState, FormEvent } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { Layout } from '../../components/common/Layout';
import { Spinner } from '../../components/common/Spinner';
import { PasswordChecklist } from '../../components/common/PasswordChecklist';
import { useAuth } from '../../hooks/useAuth';
import {
  getProfile,
  uploadProfileImage,
  putProfileImagePublicId,
  changePassword,
  type ProfileUserDto,
} from '../../services/profile.service';
import { updateUserContext } from '../../store/slices/auth.slice';
import type { AppDispatch } from '../../store/store';
import { getUserProfileProxyImageUrl } from '../../utils/employeeBioHelpers';
import { isPasswordStrong } from '../../utils/passwordValidation';
import { getResponseMessageFromError } from '../../utils/apiErrorHelpers';

const LOGIN_AFTER_PASSWORD_CHANGE =
  'Your password was changed. Please sign in with your new password.';

function PasswordVisibilityToggle({
  show,
  onToggle,
  inputId,
}: Readonly<{ show: boolean; onToggle: () => void; inputId: string }>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-button-primary transition-colors focus:outline-none"
      aria-label={show ? 'Hide password' : 'Show password'}
      aria-controls={inputId}
    >
      {show ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 01-4.243-4.243m4.242 4.242L9.88 9.88"
          />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      )}
    </button>
  );
}

export const Profile = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileUserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageUploading, setImageUploading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitError, setPasswordSubmitError] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const u = await getProfile();
      setProfile(u);
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const avatarUrl =
    profile?._id && profile.profileImagePublicId
      ? getUserProfileProxyImageUrl(profile._id, profile.profileImagePublicId)
      : null;

  const initials =
    profile?.firstName && profile?.lastName
      ? `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase()
      : '?';

  const handlePickImage = () => fileInputRef.current?.click();

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file?.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    setImageUploading(true);
    try {
      const { profileImagePublicId } = await uploadProfileImage(file);
      const updated = await putProfileImagePublicId(profileImagePublicId);
      setProfile(updated);
      dispatch(
        updateUserContext({
          profileImagePublicId: updated.profileImagePublicId ?? null,
        }),
      );
      toast.success('Profile photo updated');
    } catch (err: unknown) {
      toast.error(getResponseMessageFromError(err) ?? 'Failed to update photo');
    } finally {
      setImageUploading(false);
    }
  };

  const handleChangePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordSubmitError('');
    if (newPassword !== confirmPassword) {
      setPasswordSubmitError('Passwords do not match');
      return;
    }
    if (!isPasswordStrong(newPassword)) {
      setPasswordSubmitError(
        'Password must be at least 8 characters with one lowercase letter, one uppercase letter, one number, and one symbol.',
      );
      return;
    }
    setPasswordSubmitting(true);
    try {
      await changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await logout({
        replace: true,
        loginState: { message: LOGIN_AFTER_PASSWORD_CHANGE },
        toastMessage: null,
      });
    } catch (err: unknown) {
      setPasswordSubmitError(
        getResponseMessageFromError(err) ?? 'Failed to change password',
      );
    } finally {
      setPasswordSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex flex-1 min-h-[40vh] items-center justify-center p-6">
          <Spinner size="lg" className="text-button-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 max-w-2xl mx-auto w-full space-y-8">
        <h1 className="text-2xl font-bold text-primary md:text-3xl">Profile</h1>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-primary mb-4">Photo</h2>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-button-primary flex items-center justify-center text-white text-2xl font-semibold overflow-hidden shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(ev) => void handleImageChange(ev)}
              />
              <button
                type="button"
                onClick={handlePickImage}
                disabled={imageUploading}
                className="inline-flex items-center justify-center rounded-md bg-button-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {imageUploading ? 'Uploading…' : 'Change photo'}
              </button>
              <p className="text-xs text-gray-500">PNG or JPG, up to 2 MB.</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-primary mb-4">Account details</h2>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-gray-500">Name</dt>
              <dd className="text-primary font-medium">
                {[profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className="text-primary font-medium">{profile?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Phone</dt>
              <dd className="text-primary font-medium">{profile?.phone?.trim() ? profile.phone : '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Role</dt>
              <dd className="text-primary font-medium">{profile?.role ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Status</dt>
              <dd className="text-primary font-medium capitalize">{profile?.status ?? '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-primary mb-4">Change password</h2>
          <form onSubmit={(ev) => void handleChangePassword(ev)} className="space-y-4 max-w-md">
            {passwordSubmitError && (
              <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">{passwordSubmitError}</div>
            )}
            <div>
              <label htmlFor="profile-current-password" className="block text-sm text-primary mb-1">
                Current password
              </label>
              <div className="relative">
                <input
                  id="profile-current-password"
                  type={showPasswords ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(ev) => setCurrentPassword(ev.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-button-primary"
                />
                <PasswordVisibilityToggle
                  show={showPasswords}
                  onToggle={() => setShowPasswords((s) => !s)}
                  inputId="profile-current-password"
                />
              </div>
            </div>
            <div>
              <label htmlFor="profile-new-password" className="block text-sm text-primary mb-1">
                New password
              </label>
              <div className="relative">
                <input
                  id="profile-new-password"
                  type={showPasswords ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(ev) => setNewPassword(ev.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-button-primary"
                />
                <PasswordVisibilityToggle
                  show={showPasswords}
                  onToggle={() => setShowPasswords((s) => !s)}
                  inputId="profile-new-password"
                />
              </div>
              <PasswordChecklist password={newPassword} className="mt-2" />
            </div>
            <div>
              <label htmlFor="profile-confirm-password" className="block text-sm text-primary mb-1">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  id="profile-confirm-password"
                  type={showPasswords ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(ev) => setConfirmPassword(ev.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-button-primary"
                />
                <PasswordVisibilityToggle
                  show={showPasswords}
                  onToggle={() => setShowPasswords((s) => !s)}
                  inputId="profile-confirm-password"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={passwordSubmitting}
              className="inline-flex items-center justify-center rounded-md bg-button-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {passwordSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </section>
      </div>
    </Layout>
  );
};
