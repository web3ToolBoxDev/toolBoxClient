import React, { useState } from 'react';
import axios from "axios";
const App = () => {
  const openScript = async () => {
    const res = await axios.get("http://localhost:30001/api/openScript");
    console.log(res.data);
  }
  return (

    <div>
      <h1>Web3toolbox</h1>
      <button onClick={openScript}>openScript</button>
    </div>
  );
};
export default App;
