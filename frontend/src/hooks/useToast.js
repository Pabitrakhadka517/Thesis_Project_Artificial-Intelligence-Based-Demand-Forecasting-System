import { useDispatch } from 'react-redux'
import { addNotification, removeNotification } from '@/store/slices/uiSlice'

export function useToast() {
  const dispatch = useDispatch()

  const toast = ({ title, description, variant = 'default', duration = 4000 }) => {
    const id = Date.now()
    dispatch(addNotification({ id, title, description, variant }))
    setTimeout(() => dispatch(removeNotification(id)), duration)
    return id
  }

  return { toast }
}
