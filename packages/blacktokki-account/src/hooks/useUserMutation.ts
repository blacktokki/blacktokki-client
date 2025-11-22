import { useMutation } from 'react-query';

import useAuthContext from './useAuthContext';
import { patchUser } from '../services/account';

export default function useUserMutation() {
  const { auth, dispatch } = useAuthContext();
  const _update = useMutation(patchUser, {
    onSuccess: (data, user) => {
      if (user.id === auth.user?.id)
        if (user.username && user.password) {
          dispatch({ type: 'LOGIN_REQUEST', username: user.username, password: user.password });
        } else {
          dispatch({ type: 'REFRESH' });
        }
      else {
      }
    },
  });
  return { update: _update.mutateAsync };
}
