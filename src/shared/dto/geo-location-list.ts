export interface GeoLocationList {
    geoLocationList: GeoLocationListElement[];
}

export interface GeoLocationListElement {
    geoId:      string;
    type:       string;
    isPrimary:  boolean;
    location:   Location;
    properties: Properties;
}

export interface Location {
    latitude:  number;
    longitude: number;
}

export interface Properties {
    orgGuid:               string;
    orgName:               string;
    orgType:               string;
    orgTransliteratedName: string;
    address:               string;
    transliteratedAddress: string;
    languageCode:          string;
    schedule:              Schedule;
    relatedLanguageCodes:  any[];
    phones:                Phone[];
    isPrivateMtgPlace:     boolean;
    memorialAddress:       string;
    memorialTime:          string;
}

export interface Phone {
    phone: string;
    ext:   string;
}

export interface Schedule {
    current:     Current;
    futureDate:  Date;
    changeStamp: null;
    future:      Current;
}

export interface Current {
    weekend: Midweek;
    midweek: Midweek;
}

export interface Midweek {
    weekday: number;
    time:    string;
}