// src/App.jsx

import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./Login";
import DashboardLayout from "./DashboardLayout";
import DashboardHome from "./DashboardHome";
import AddPaddy from "./AddPaddy";
import ViewPaddy from "./ViewPaddy";
import ViewKayidhaPaddy from "./ViewKayidhaPaddy";
import CalculateKayidha from "./CalculateKayidha";
import AddTruckSheet from "./AddTruckSheet";
import ViewTruckSheet from "./ViewTruckSheet";
import AddDriverData from "./AddDriverData";
import ViewDriverData from "./ViewDriverData";
import ViewWorkersData from "./ViewWorkersData";
import WorkersPay from "./WorkersPay";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(
    localStorage.getItem("isLoggedIn") === "true",
  );

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return <Login setIsLoggedIn={setIsLoggedIn} />;
  }

  return (
    <Routes>
      <Route path="/" element={<DashboardLayout onLogout={handleLogout} />}>
        <Route index element={<DashboardHome />} />
        <Route path="paddy/add" element={<AddPaddy />} />
        <Route path="paddy/edit/:journeyId" element={<AddPaddy />} />
        <Route path="paddy/view" element={<ViewPaddy />} />
        <Route path="paddy/kayidha-paddy" element={<ViewKayidhaPaddy />} />
        <Route path="paddy/calculate-kayidha" element={<CalculateKayidha />} />
        <Route path="truck-sheet/add" element={<AddTruckSheet />} />
        <Route path="truck-sheet/edit/:sheetId" element={<AddTruckSheet />} />
        <Route path="truck-sheet/view" element={<ViewTruckSheet />} />
        <Route path="drivers/add" element={<AddDriverData />} />
        <Route path="drivers/edit/:recordId" element={<AddDriverData />} />
        <Route path="drivers/view" element={<ViewDriverData />} />
        <Route path="workers/view" element={<ViewWorkersData />} />
        <Route path="workers/pay" element={<WorkersPay />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
