import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

export const productsService = {
  getAll:       (params = {}) => axiosInstance.get(`/products?${buildQueryString(params)}`),
  getById:      (id)          => axiosInstance.get(`/products/${id}`),
  getStats:     ()            => axiosInstance.get('/products/stats'),
  getCategories: ()           => axiosInstance.get('/categories'),
  create:       (data)        => axiosInstance.post('/products', data),
  update:       (id, data)    => axiosInstance.patch(`/products/${id}`, data),
  delete:       (id)          => axiosInstance.delete(`/products/${id}`),
  getDetail:    (id)          => axiosInstance.get(`/products/${id}/detail`),

  uploadImage: (id, file) => {
    const form = new FormData()
    form.append('image', file)
    return axiosInstance.post(`/products/${id}/image`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deleteImage: (id) => axiosInstance.delete(`/products/${id}/image`),
}
