import { Container, Button, Row, Col,Card } from 'react-bootstrap';
import { useState,useEffect } from 'react';
import TransferPage from './transferPage';
import ExchangeWithdrawPage from './exchangeWithdrawPage';
import FaucetPage from './faucetPage';


export default function DefaultTask() {
    let [taskList,setTaskList] = useState([]);
    let [pageState,setPageState] = useState("main");
    let [currentTask,setCurrentTask] = useState({});


    useEffect(() => {
        setTaskList([
            {
                taskKey:"transfer",
                taskName:"转账",
                description:"支持ETH和ERC20代币的转账"
            },
            {
                taskKey:"exchangeWithdraw",
                taskName:"提币",
                description:"支持币安和OK交易所的提币"
            },
            {
                taskKey:"sepoliaFaucet",
                taskName:"sepolia自动领水",
                description:"自动领取sepolia水龙头"
            }
        ]);
        
    },[]);
    const enterSubPage = (task) => {
        setPageState(task.taskKey);
        setCurrentTask(task);
    }
    const returnMainPage = () => {
        setPageState("main");
    }

    return(
        <Container>
            <h1>内置任务</h1>
            
            {pageState === "main"&&taskList.map((task,index) => (
                //每行2个任务
                index%2 === 0 ? <Row key={index} style={{margin:'10px'}}>
                    <Col md={6}>
                        <Card>
                        <Card.Body className="d-flex flex-column justify-content-between">
                            
                            <Card.Title>{task.taskName}</Card.Title>
                            <Card.Text>
                                {task.description}
                            </Card.Text>
                            
                            <div className="d-flex justify-content-end">
                                <Button variant="primary" onClick={()=>enterSubPage(task)}>进入页面</Button>
                            </div>
                        </Card.Body>
                        </Card>
                    </Col>
                    {index+1 < taskList.length ? 
                    <Col md={6}>
                        <Card>
                            <Card.Body className="d-flex flex-column justify-content-between">
                                <Card.Title>{taskList[index+1].taskName}</Card.Title>
                                <Card.Text>
                                    {taskList[index+1].description}
                                </Card.Text>
                                <div className="d-flex justify-content-end">
                                    <Button variant="primary" onClick={()=>enterSubPage(taskList[index+1])}>进入页面</Button>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                    : null}
                </Row> : null
            ))}
            {pageState === "transfer"&&<TransferPage task={currentTask} returnMainPage={returnMainPage}/>}
            {pageState === "exchangeWithdraw"&&<ExchangeWithdrawPage task={currentTask} returnMainPage={returnMainPage}/>}
            {pageState === "sepoliaFaucet"&&<FaucetPage task={currentTask} returnMainPage={returnMainPage}/>}
            
        </Container>
    )
}