'use client'

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import useISIACardData from '@/hooks/useISIACardData.hook';
import useISIACardImage from '@/hooks/useISIACardImage.hook';
import useNationalSign from '@/hooks/useNationalSign.hook';
import useCountryFlag from '@/hooks/useCountryFlag.hook';
import useTouchDevice from '@/hooks/useTouchDevice.hook';
import { formatDateISO8601 } from '@/utils/dateTimeFormat.utils';
import PWAInstallButton from '@/components/PWAInstallButton/index';
import NavigatorOnlineStatus from '@/components/NavigatorOnlineStatus/index';
import ResetAllCachedDataButton from '@/components/ResetAllCachedDataButton/index';
import MessagesDisplay from '@/components/MessagesDisplay/index';
import { useMessages } from '@/contexts/MessageContext';

import './styles.scss';

const LOADING_CARD_MESSAGE = 'Please, wait. Loading your card...';
const FRONT_CARD_IMAGE_SRC = '/images/ISIA_card_front_with_label.webp';
const BACK_CARD_IMAGE_SRC = '/images/ISIA_card_back.webp';
const ROTATE_180 = 'rotate-y-180';
const ROTATE_360 = 'rotate-y-360';

enum CardSide {
  FRONT = 'front',
  BACK = 'back',
};

const LoadingDataMessage = () => {
  return (
    <div className="load-data-status-panel">
      <div className='loading-data-message'><p>{LOADING_CARD_MESSAGE}</p></div>
    </div>
  );
};

const CardISIACode = ({ isiaCode }: { isiaCode?: string }) => {
  if (!isiaCode)
    return;
  return <span className="card-text card-isia-code">{isiaCode}</span>;
};

const CardExpirationDate = ({ expirationDate }: { expirationDate?: Date }) => {
  if (!expirationDate)
    return null;
  return <span className="card-text card-expiration-date">{formatDateISO8601(expirationDate)}</span>;
};

const CardOwnerName = ({ cardOwnerName }: { cardOwnerName?: string }) => {
  if (!cardOwnerName)
    return null;
  return <span className="card-text card-owner-name">{cardOwnerName}</span>;
};

const CardOwnerTitle = ({ cardOwnerTitle }: { cardOwnerTitle?: string }) => {
  if (!cardOwnerTitle)
    return null;
  return <span className="card-text card-owner-title">{cardOwnerTitle}</span>;
};

const CardOwnerCountryFlag = ({ imageURL }: { imageURL?: string | null }) => {
  if (!imageURL)
    return null;
  return (
    <div
      className="card-owner-country-flag"
      style={{ backgroundImage: `url(${imageURL})` }}>
    </div>
  );
};

const CardOwnerCountryCode = ({ cardOwnerCountryCode }: { cardOwnerCountryCode?: string }) => {
  if (!cardOwnerCountryCode)
    return null;
  return <span className="card-text card-owner-country-code">{cardOwnerCountryCode}</span>;
};

const CardOwnerAssociation = ({ cardOwnerAssociation }: { cardOwnerAssociation?: string }) => {
  if (!cardOwnerAssociation)
    return null;
  return <span className="card-text card-owner-association">{cardOwnerAssociation}</span>;
};

const CardOwnerMembershipNo = ({ cardOwnerMembershipNo }: { cardOwnerMembershipNo?: string }) => {
  if (!cardOwnerMembershipNo)
    return null;
  return <span className="card-text card-owner-membershipno">{cardOwnerMembershipNo}</span>;
};

const CardOwnerPhoto = ({ isCardFrontSide, imageURL }: { isCardFrontSide: boolean, imageURL?: string | null }) => {
  if (!imageURL)
    return null;
  const className = isCardFrontSide ? 'front-card-image' : 'back-card-image';
  return (
    <div
      className={className}
      style={{ backgroundImage: `url(${imageURL})` }}>
    </div>
  );
};

const CardOwnerWebSite = ({ cardOwnerWebSite }: { cardOwnerWebSite?: string }) => {
  if (!cardOwnerWebSite)
    return null;
  return <span className="card-text card-owner-website">{cardOwnerWebSite}</span>;
};

const CardOwnerNationalSign = ({ imageURL }: { imageURL?: string | null }) => {
  if (!imageURL)
    return null;
  return (
    <div
      className="card-owner-national-sign"
      style={{ backgroundImage: `url(${imageURL})` }}>
    </div>
  );
};


export default function ISIACard() {
  const { cardData, loading: loadingCardData, error: errorLoadingCardData } = useISIACardData();
  const { imageURL: ownerPhotoURL, loading: loadingOwnerPhoto, error: errorLoadingOwnerPhoto } = useISIACardImage();
  const { imageURL: nationalSignURL, loading: loadingNationalSign, error: errorLoadingNationalSign } = useNationalSign();
  const { imageURL: countryFlagURL, loading: loadingCountryFlag, error: errorLoadingCountryFlag } = useCountryFlag(cardData?.countryCode);
  const [rotate, setRotate] = useState<string>('');
  const [invisibleCardSide, setInvisibleCardSide] = useState<CardSide>(CardSide.BACK);
  const [isClient, setIsClient] = useState<boolean>(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const { addMessage } = useMessages();
  const { isTouchDevice } = useTouchDevice();

  useEffect(() => {
    setIsClient(true);

    // We need to track front and back card images loading
    const frontCardImage = new Image();
    const backCardImage = new Image();
    let loaded = 0;
    
    const handleImageLoad = (cardSide: CardSide) => {
      return () => {
        loaded++;
        addMessage({ message: { type: 'success', text: `Loaded ${cardSide} card image`, level: 'debug' } });
        if (loaded === 2)
          setImagesLoaded(true);
      };
    };

    const handleImageLoadError = (cardSide: CardSide) => {
      return () => {
        const message = `Failed to load ${cardSide} card image`;
        addMessage({ message: { type: 'error', text: message, level: 'app' }, consoleLog: false });
        addMessage({ message: { type: 'error', text: message, level: 'debug' } });
      };
    };
    
    frontCardImage.onload = handleImageLoad(CardSide.FRONT);
    frontCardImage.onerror = handleImageLoadError(CardSide.FRONT);
    backCardImage.onload = handleImageLoad(CardSide.BACK);
    backCardImage.onerror = handleImageLoadError(CardSide.BACK);
    
    frontCardImage.src = FRONT_CARD_IMAGE_SRC;
    backCardImage.src = BACK_CARD_IMAGE_SRC;
  }, []);

  // Check if we're loading
  const isLoading = isClient && (
    !imagesLoaded ||
    loadingCardData || 
    loadingOwnerPhoto || 
    loadingNationalSign ||
    loadingCountryFlag
  );

  // Check if card has no data (but not loading and not errored)
  const hasNoData = isClient && imagesLoaded && 
    !loadingCardData && 
    !loadingOwnerPhoto && 
    !loadingNationalSign && 
    !loadingCountryFlag &&
    !cardData && 
    !ownerPhotoURL && 
    !nationalSignURL && 
    !countryFlagURL &&
    !errorLoadingCardData && 
    !errorLoadingOwnerPhoto && 
    !errorLoadingNationalSign && 
    !errorLoadingCountryFlag;

  // Show loading when:
  // 1. Not yet on client (prevents flash of content)
  // 2. Actively loading data
  // 3. Card appears without essential data
  const showLoading = !isClient || isLoading || hasNoData;

  useEffect(() => {
    const error = errorLoadingCardData || errorLoadingOwnerPhoto || errorLoadingNationalSign ||
                  errorLoadingCountryFlag || null;
    if (error) {
      addMessage({ message: { type: 'error', text: error, level: 'app' }, consoleLog: false });
      addMessage({ message: { type: 'error', text: error, level: 'debug' } });
    }
  }, [errorLoadingCardData, errorLoadingOwnerPhoto, errorLoadingNationalSign, errorLoadingCountryFlag, addMessage]);

  const handleRotate = useCallback(() => {
    if (rotate === '' || rotate === ROTATE_360) {
      setRotate(ROTATE_180);
      setInvisibleCardSide(CardSide.FRONT);
    } else {
      setRotate(ROTATE_360);
      setInvisibleCardSide(CardSide.BACK);
    }
  }, [rotate]);

  return (
    <div className='outer-card-container'>
      <div className='inner-card-container'>
        <div className="card-title">
          {/* <a href="https://dev.isia.ski">
            <img src="/images/logo.svg" alt="Go to main page" />
          </a> */}
          <Link
            href="https://dev.isia.ski"
            className="logo"
            prefetch={false}
          >
            <img src="/images/logo.svg" alt="Go to main page" />
          </Link>
          <span>Your card (good?)</span>
        </div>
        {(!showLoading && isTouchDevice !== undefined) &&
          <div>
            {isTouchDevice ? 'Tap' : 'Click'} on the card to see its {invisibleCardSide} side
          </div>
        }
        <div className={`card ${rotate}`}>
          {showLoading && <LoadingDataMessage />}
          <div
            className={`card-face`}
            onClick={handleRotate}>
            <img
              src={FRONT_CARD_IMAGE_SRC}
              alt="ISIA card front side"
              className="image"
            />
            <CardISIACode isiaCode={cardData?.isiaCode} />
            <CardExpirationDate expirationDate={cardData?.expirationDate} />
          </div>
          <div
            className={`card-back ${ROTATE_180}`}
            onClick={handleRotate}>
            <img
              src={BACK_CARD_IMAGE_SRC}
              alt="ISIA card back side"
              className="image"
            />
            <CardOwnerName cardOwnerName={cardData?.name} />
            <CardOwnerTitle cardOwnerTitle={cardData?.title} />
            <CardOwnerCountryFlag imageURL={countryFlagURL} />
            <CardOwnerCountryCode cardOwnerCountryCode={cardData?.countryCode} />
            <CardOwnerAssociation cardOwnerAssociation={cardData?.association} />
            <CardOwnerMembershipNo cardOwnerMembershipNo={cardData?.membershipNo} />
            <CardOwnerPhoto isCardFrontSide={false} imageURL={ownerPhotoURL} />
            <CardOwnerWebSite cardOwnerWebSite={cardData?.webSite} />
            <CardOwnerNationalSign imageURL={nationalSignURL} />
          </div>
        </div>
        <div className="app-buttons-block">
          {isClient && (
            <>
              <PWAInstallButton className="btn" />
              <ResetAllCachedDataButton className='btn btn-default' />
              <NavigatorOnlineStatus />
            </>
          )}
        </div>
        <div className="messages-block">
          <MessagesDisplay displayDebugMessages={process.env.NODE_ENV === 'development'} />
        </div>
      </div>
    </div>
  );
}
