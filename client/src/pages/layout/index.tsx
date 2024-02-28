import React from 'react';
import WalletManager,{Result} from '@/web3/metamask';
import "./index.scss";
import { useTranslation } from 'react-i18next';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import Button from 'react-bootstrap/Button';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setLanguage } from '@/store/modules/util';
import MenuItemComponent,{MenuItem} from '@/components/menuItem';
import { RootStateInterface } from '@/types/global';
import { setAddress,setChainId } from '@/store/modules/account';
import LoginApiManager from '@/apis/loginApi';
import { useNavigate } from 'react-router-dom';
interface LayoutProps {
  Child:React.FC
}
function useWindowSize(): { width: number } {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return windowSize;
}

const Layout: React.FC<LayoutProps> = ({Child}) => {
  const apiManager = LoginApiManager.getInstance();
  const walletManger = WalletManager.getInstance();
  const { width } = useWindowSize();
  const isMobile = width <= 992;
  const [show, setShow] = useState(false);
  const [connected,setConnected] = useState(false);

  const address = useSelector((state: RootStateInterface) => state.account.address);
  const chainId:number = useSelector((state: RootStateInterface) => state.account.chainId);
  const dispatch: Function = useDispatch();
  const navigate = useNavigate();
  const setDisplayAddress = (address:string)=>{
    if(!address && !connected){
      setDisplayText(t('connect'));
      return;
    }
    setDisplayText(address?.substring(0,6) + "..." + address?.substring(address?.length - 4))
  }

  const addressChanged = async (newAddress:string)=>{
    console.log("addressChanged",newAddress);
    const resultLogout:Result = await apiManager.logout({address:address});
    if (!resultLogout.success){
      alert(resultLogout.message);}
    dispatch(setAddress(newAddress));
    setDisplayAddress(newAddress);
    const resultLogin:Result = await apiManager.login({address:newAddress});
    if (!resultLogin.success){
      alert(resultLogin.message);
    }
  }
  const chainChanged = (cId:number)=>{
    dispatch(setChainId(cId));
  }
  const disconnect = ()=>{
    console.log("disconnect");
    dispatch(setAddress(null));
    dispatch(setChainId(null));
    setConnected(false);
    setDisplayText(t('connect'));
    walletManger.empty();
  }
  
  const { t, i18n } = useTranslation();

  const mobileMenu:MenuItem[] = [
    {
      name:t("toolList"),
      subMenu: [],
      click:()=>{
        navigate('/');
      }
    },
    {
      name:t("myTool"),
      subMenu: [],
      click:()=>{
        navigate('/userList');
      }
    }
  ]
  
  const menu: MenuItem[] = [
    {
      name: t("language"),
      subMenu: [
        {
          name: "English",
          value: "en",
          selected: i18n.language === "en",
          click: () => {
            changeLanguage("en");
          }
        },
        {
          name: "简体中文",
          value: "zh_cn",
          selected: i18n.language === "zh_cn",
          click: () => {
            changeLanguage("zh_cn");
          }
        }
      ],
      click:undefined
    }, {
      name: t("switchToBsc"),
      subMenu: [],
      click: async ()=>{
        if (!walletManger.provider){
          alert("Please connect to wallet first");
          return;
        }else{
          if(chainId===56){
            alert("You are already on BSC Mainnet");
          }else{
            const result:Result = await walletManger.switchNetwork(56);
            console.log("switchNetwork",result);
            if(!result.success){
              alert(result.message);
            }
          }
        }
      }
    }
  ]
  

  

  // Function to change the language and store it in localStorage
  const changeLanguage = (language: string) => {
    i18n.changeLanguage(language);
    dispatch(setLanguage(language));
    localStorage.setItem('selectedLanguage', language);
  };
  // Function to retrieve the language from localStorage on page load
  useEffect(() => {
    const storedLanguage = localStorage.getItem('selectedLanguage');
    if (storedLanguage) {
      i18n.changeLanguage(storedLanguage);
    }
    connect();
  }, []); // Empty dependency array ensures this effect runs only once on mount

  useEffect(()=>{
    // setDisplayAddress(address);
    },[address]
  )

  const [displayText,setDisplayText]:[string,Function] = useState(t('connect'));
  const handleDisplayTextMouthEnter = () => {
      if (connected) {
          setDisplayText(t('disconnect'));
      } 
  }
  const handleDisplayTextMouthLeave = () => {
      
      if (connected) {
          setDisplayAddress(address);
      }else{
          setDisplayText(t('connect'));
      }
      
  }
  const connect = async() => {
    const result:Result =await walletManger.connect({addressChanged,chainChanged,disconnect});
        if(!result.success){
          alert(result.message);
          return;
        }
        const params = {
          address:walletManger.address
        }
        const conServerResult:Result = await apiManager.login(params);
        if(!conServerResult.success){
          alert(conServerResult.message);
          return;
        }
        setConnected(true);
        dispatch(setAddress(walletManger.address));
        dispatch(setChainId(walletManger.chainId));
        if (walletManger.address)
          setDisplayAddress(walletManger.address);
  }
  const onClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (connected) {
        const params = {
          address:address
        }
        const result:Result = await apiManager.logout(params);
        if(!result.success){
          alert(result.message);
        }
        walletManger.empty();
        
        dispatch(setAddress(null));
        dispatch(setChainId(null));
        setDisplayText(t('connect'));
        setConnected(false);
        
    } else {     
        await connect();
    }
  }
  return (
    <>
      <Navbar className="navbar-my navbar-dark fixed-top">
        <Container>
          <Navbar.Brand href="/" className='navbar-brand-my'>Web3 ToolBox</Navbar.Brand>
          
          {!isMobile&&<Nav className="me-auto">
            <Nav.Link href="/">{t('toolList')}</Nav.Link>
            <Nav.Link href="/userList">{t('myTool')}</Nav.Link>
          </Nav>}
          {!isMobile&&<Button className="btn-connect" onClick={onClick} 
            onMouseEnter={handleDisplayTextMouthEnter}
            onMouseLeave={handleDisplayTextMouthLeave}>{displayText}</Button>}
          <Button className='btn-more ms-3' onClick={() => setShow(true)} />
        </Container>
      </Navbar>
      <Offcanvas className={'offcanvas-bg'} show={show} onHide={() => setShow(false)} placement='end'>
        <Offcanvas.Header closeButton closeVariant='white'>
        {!isMobile&&<Offcanvas.Title>Web3 ToolBox</Offcanvas.Title>}
        {isMobile&&<Button className="btn-connect" onClick={onClick} 
            onMouseEnter={handleDisplayTextMouthEnter}
            onMouseLeave={handleDisplayTextMouthLeave}>{displayText}</Button>}
        </Offcanvas.Header>
        <Offcanvas.Body>
          
          <Nav className="flex-column">
            {
              isMobile&&mobileMenu.map((item: MenuItem, index: number) => (
                <MenuItemComponent key={index} item={item} />
              ))
            }
            {
              menu.map((item: MenuItem, index: number) => (
                <MenuItemComponent key={index} item={item} />
              ))
            }
          </Nav>
        </Offcanvas.Body>
      </Offcanvas>
      <Container>
        <Child/>
      </Container>
    </>
  )
}
export default Layout;