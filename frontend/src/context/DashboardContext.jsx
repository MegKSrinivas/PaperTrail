import { createContext, useContext, useState, useRef } from 'react'

const DashboardContext = createContext(null)

export function DashboardProvider({ children }) {
  const [activePaperId, setActivePaperId] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const mutatePapersRef = useRef(null)

  return (
    <DashboardContext.Provider value={{
      activePaperId, setActivePaperId,
      lastResult, setLastResult,
      mutatePapersRef,
    }}>
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  return useContext(DashboardContext)
}
