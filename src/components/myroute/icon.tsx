import { type ReactNode } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { Palette } from '@/constants/theme';

export type IconName =
  | 'arrow'
  | 'back'
  | 'bell'
  | 'bike'
  | 'bookmark'
  | 'camera'
  | 'car'
  | 'check'
  | 'chevron'
  | 'church'
  | 'close'
  | 'compass'
  | 'heart'
  | 'home'
  | 'layers'
  | 'locate'
  | 'map'
  | 'menu'
  | 'more'
  | 'pin'
  | 'plus'
  | 'request'
  | 'search'
  | 'share'
  | 'shop'
  | 'user'
  | 'walk';

/** The wireframe icon set, drawn with the same 24x24 outlines. */
const paths: Record<IconName, ReactNode> = {
  arrow: (
    <>
      <Path d="M12 19V5" />
      <Path d="m6 11 6-6 6 6" />
    </>
  ),
  back: <Path d="m15 18-6-6 6-6" />,
  bell: (
    <>
      <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <Path d="M10 21h4" />
    </>
  ),
  bike: (
    <>
      <Circle cx={5} cy={17} r={3} />
      <Circle cx={19} cy={17} r={3} />
      <Path d="m12 17-4-8h4l3 5h-5l3-7h3" />
    </>
  ),
  bookmark: <Path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4Z" />,
  camera: (
    <>
      <Path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3Z" />
      <Circle cx={12} cy={13} r={3} />
    </>
  ),
  car: (
    <>
      <Path d="m5 17-1 2v2h3v-2h10v2h3v-2l-1-2-2-6H7Z" />
      <Circle cx={7.5} cy={16.5} r={1} />
      <Circle cx={16.5} cy={16.5} r={1} />
    </>
  ),
  check: <Path d="m5 12 4 4L19 6" />,
  chevron: <Path d="m9 18 6-6-6-6" />,
  church: (
    <>
      <Path d="M5 21V9l7-5 7 5v12" />
      <Path d="M9 21v-6h6v6M12 3V1m-2 2h4" />
    </>
  ),
  close: (
    <>
      <Path d="m6 6 12 12" />
      <Path d="M18 6 6 18" />
    </>
  ),
  compass: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="m15 9-2 4-4 2 2-4Z" />
    </>
  ),
  heart: (
    <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
  ),
  home: (
    <>
      <Path d="m3 11 9-8 9 8" />
      <Path d="M5 10v11h14V10M9 21v-7h6v7" />
    </>
  ),
  layers: (
    <>
      <Path d="m12 2 9 5-9 5-9-5Z" />
      <Path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
  locate: (
    <>
      <Circle cx={12} cy={12} r={3} />
      <Circle cx={12} cy={12} r={8} />
      <Path d="M12 2V0M12 24v-2M22 12h2M0 12h2" />
    </>
  ),
  map: (
    <>
      <Path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" />
      <Path d="M9 3v15M15 6v15" />
    </>
  ),
  menu: (
    <>
      <Path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  more: null,
  pin: (
    <>
      <Path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <Circle cx={12} cy={10} r={2.5} />
    </>
  ),
  plus: (
    <>
      <Path d="M12 5v14M5 12h14" />
    </>
  ),
  request: (
    <>
      <Path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
      <Path d="M8 9h8M8 13h5" />
    </>
  ),
  search: (
    <>
      <Circle cx={11} cy={11} r={7} />
      <Path d="m20 20-4-4" />
    </>
  ),
  share: (
    <>
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
    </>
  ),
  shop: (
    <>
      <Path d="M4 10v11h16V10M3 4h18l-1 6a3 3 0 0 1-5 1 3 3 0 0 1-6 0 3 3 0 0 1-5-1Z" />
      <Path d="M9 21v-6h6v6" />
    </>
  ),
  user: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 22a8 8 0 0 1 16 0" />
    </>
  ),
  walk: (
    <>
      <Circle cx={13} cy={4} r={2} />
      <Path d="m10 21 2-7-3-3 2-4 4 3 3 1M14 14l4 7" />
    </>
  ),
};

export type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  color?: string;
};

export function Icon({ name, size = 22, strokeWidth = 1.9, color = Palette.ink }: IconProps) {
  return (
    <Svg
      fill={name === 'more' ? color : 'none'}
      height={size}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}>
      {/* `more` is the only filled icon in the set: three solid dots. */}
      {name === 'more' ? (
        <>
          <Circle cx={5} cy={12} fill={color} r={1} stroke="none" />
          <Circle cx={12} cy={12} fill={color} r={1} stroke="none" />
          <Circle cx={19} cy={12} fill={color} r={1} stroke="none" />
        </>
      ) : (
        paths[name]
      )}
    </Svg>
  );
}
