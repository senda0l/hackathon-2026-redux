import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const role = ref<string | null>(localStorage.getItem('role'))
  const companyName = ref<string | null>(localStorage.getItem('companyName'))
  const userEmail = ref<string | null>(localStorage.getItem('userEmail'))

  const isLoggedIn = computed(() => !!token.value)
  const isGov = computed(() => role.value === 'GOV_ADMIN')
  const isCompany = computed(() => role.value === 'COMPANY')

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password })
    token.value = res.data.access_token
    role.value = res.data.role
    userEmail.value = email
    localStorage.setItem('token', token.value!)
    localStorage.setItem('role', role.value!)
    localStorage.setItem('userEmail', userEmail.value)
    api.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
  }

  function logout() {
    token.value = null
    role.value = null
    userEmail.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('userEmail')
    delete api.defaults.headers.common['Authorization']
  }

  // Restore token on app load
  if (token.value) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
  }

  return { token, role, userEmail, isLoggedIn, isGov, isCompany, login, logout, companyName }
})
